import 'dotenv/config';
import fs from 'fs/promises';
import { loadConfig } from './config.js';
import { validateAuth, fetchUnread, addLabel, removeInboxLabel, markRead, starMessage, ensureLabelsExist, clearLabelCache } from './gmail.js';
import { prefilter } from './prefilter.js';
import { classify } from './classifier.js';
import { createServer } from './server.js';
import { sleep } from './utils.js';
import { logger } from './logger.js';

const TIMESTAMP_FILE = './lastTimestamp.txt';

let running = true;
let shutdownResolve = null;

export async function main() {
  // Load config
  const config = loadConfig();

  logger.info('Clearmail v2 starting');
  logger.info(`Dry run: ${config.behavior.dryRun ? 'ON' : 'OFF'}`);

  // Validate Gmail auth
  const authed = await validateAuth();
  if (!authed) {
    logger.error('Gmail authentication failed. Run setup-auth.js first.');
    process.exit(1);
  }

  // Collect all label names we'll need
  const labelNames = new Set();
  labelNames.add(config.behavior.rejectedLabel);
  labelNames.add(config.behavior.unknownLabel);
  for (const cat of config.categories) {
    labelNames.add(cat.label);
  }

  // Ensure labels exist in Gmail
  if (!config.behavior.dryRun) {
    await ensureLabelsExist([...labelNames]);
    logger.info(`Ensured ${labelNames.size} labels exist`);
  } else {
    logger.info(`[DRY RUN] Would ensure ${labelNames.size} labels exist: ${[...labelNames].join(', ')}`);
  }

  // Start optional debug HTTP server
  if (config.server.enabled && config.server.apiKey) {
    const app = createServer(config);
    app.listen(config.server.port, () => {
      logger.info(`Debug server running on port ${config.server.port}`);
    });
  }

  // Graceful shutdown
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Main polling loop
  while (running) {
    try {
      await processCycle(config);
    } catch (err) {
      logger.error(`Polling cycle error: ${err.message}`);
    }

    if (running) {
      await interruptibleSleep(config.behavior.pollIntervalSeconds * 1000);
    }
  }

  logger.info('Clearmail shutting down');
}

async function processCycle(config) {
  const since = await getLastTimestamp();
  const runStart = Date.now();
  const dryLabel = config.behavior.dryRun ? ' [DRY RUN]' : '';

  // ── Run banner ──────────────────────────────────────────
  logger.raw('');
  logger.raw('═══════════════════════════════════════════════════════════');
  logger.raw(`  Starting run at ${new Date().toString()}${dryLabel}`);
  logger.raw('═══════════════════════════════════════════════════════════');

  let emails;
  try {
    emails = await fetchUnread(since);
  } catch (err) {
    logger.error(`Failed to fetch emails: ${err.message}`);
    logger.raw('');
    return;
  }

  if (emails.length === 0) {
    logger.info('No new unread emails since last run');
    logger.raw('───────────────────────────────────────────────────────────');
    logger.raw('  No mail to process');
    logger.raw('');
    return;
  }

  const toProcess = emails.slice(0, config.behavior.maxEmailsPerBatch);
  let processed = 0;

  for (const email of toProcess) {
    try {
      await processEmail(email, config, processed + 1, toProcess.length);
      processed++;
    } catch (err) {
      logger.error(`Error processing email ${email.id}: ${err.message}`);
    }
  }

  // ── Run footer ──────────────────────────────────────────
  const elapsed = ((Date.now() - runStart) / 1000).toFixed(1);
  logger.raw('───────────────────────────────────────────────────────────');
  logger.raw(`  Run complete — ${processed} email(s) in ${elapsed}s`);
  logger.raw('');

  const now = new Date();
  await saveLastTimestamp(now);
}

async function processEmail(email, config, index, total) {
  const sender = extractEmailAddress(email.from);
  const subject = truncate(email.subject, 60);
  const num = `[${index}/${total}]`;

  // Step 1: Deterministic prefilter
  const result = prefilter(email, config);

  if (result.action === 'keep') {
    logAction('KEEP', '#', sender, subject, `whitelist`, config, num);
    await applyKeepActions(email, config);
    return;
  }

  if (result.action === 'reject') {
    logAction('REJECT', 'x', sender, subject, `blacklist`, config, num);
    await applyReject(email, undefined, config);
    return;
  }

  // Step 2: LLM classification
  let classification;
  try {
    classification = await classify(email, config);
  } catch (err) {
    logger.error(`LLM classification failed for ${email.id}: ${err.message}`);
    logAction('REJECT', '!', sender, subject, `${config.behavior.unknownLabel} (LLM error)`, config, num);
    await applyReject(email, config.behavior.unknownLabel, config);
    return;
  }

  const action = classification.meets_criteria ? 'KEEP' : 'REJECT';
  const symbol = classification.meets_criteria ? '#' : 'x';
  const detail = `${classification.category} — ${classification.explanation}`;

  logAction(action, symbol, sender, subject, detail, config, num);

  if (classification.meets_criteria) {
    await applyKeepActions(email, config);
    if (!config.behavior.dryRun && classification.category !== config.behavior.unknownLabel) {
      clearLabelCache();
      await addLabel(email.id, classification.category);
    }
  } else {
    await applyReject(email, classification.category, config);
  }
}

async function applyKeepActions(email, config) {
  if (config.behavior.dryRun) return;
  if (config.behavior.starKept) {
    await starMessage(email.id);
  }
}

function logAction(action, symbol, sender, subject, detail, config, num = '') {
  const dry = config.behavior.dryRun ? '[DRY] ' : '';
  const pad = action === 'KEEP' ? ' ' : '';
  const counter = num ? `${num} ` : '';
  logger.raw(`  ${dry}${counter}${symbol} ${action}${pad}  ${sender.padEnd(35)} ${subject.padEnd(62)} ${detail}`);
}

function extractEmailAddress(from) {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : (from || '').trim();
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 3) + '...' : str;
}

async function applyReject(email, categoryLabel, config) {
  if (config.behavior.dryRun) return;

  await addLabel(email.id, config.behavior.rejectedLabel);

  if (categoryLabel && categoryLabel !== config.behavior.unknownLabel) {
    clearLabelCache();
    await addLabel(email.id, categoryLabel);
  } else if (categoryLabel === config.behavior.unknownLabel || !categoryLabel) {
    await addLabel(email.id, config.behavior.unknownLabel);
  }

  await removeInboxLabel(email.id);

  if (config.behavior.markRejectedRead) {
    await markRead(email.id);
  }
}

async function getLastTimestamp() {
  try {
    const str = await fs.readFile(TIMESTAMP_FILE, 'utf8');
    return new Date(str.trim());
  } catch {
    return new Date(Date.now() - 15 * 60 * 1000);
  }
}

async function saveLastTimestamp(date) {
  await fs.writeFile(TIMESTAMP_FILE, date.toISOString(), 'utf8');
}

function shutdown() {
  running = false;
  if (shutdownResolve) shutdownResolve();
}

function interruptibleSleep(ms) {
  return Promise.race([
    sleep(ms),
    new Promise(resolve => { shutdownResolve = resolve; }),
  ]);
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^\.\//, ''))) {
  main().catch(err => {
    logger.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
