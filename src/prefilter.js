import { logger } from './logger.js';

export function prefilter(email, config) {
  const { from = '' } = email;
  const sender = extractAddress(from);

  // Whitelist check (takes priority)
  for (const entry of config.whitelist) {
    if (matchEntry(sender, entry)) {
      logger.debug(`Whitelist match: ${sender} matched ${entry}`);
      return { action: 'keep', reason: `whitelist:${entry}` };
    }
  }

  // Blacklist check
  for (const entry of config.blacklist) {
    if (matchEntry(sender, entry)) {
      logger.debug(`Blacklist match: ${sender} matched ${entry}`);
      return { action: 'reject', reason: `blacklist:${entry}` };
    }
  }

  return { action: 'classify' };
}

function extractAddress(fromHeader) {
  if (!fromHeader) return '';

  // Handle "Name <email>" or just "email" format
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();

  return fromHeader.toLowerCase().trim();
}

function matchEntry(address, entry) {
  const pattern = entry.trim().toLowerCase();

  // Wildcard pattern: *@example.com
  if (pattern.startsWith('*@')) {
    const domain = pattern.substring(2);
    return address.endsWith('@' + domain) || address.endsWith('.' + domain);
  }

  // Exact match
  return address === pattern;
}
