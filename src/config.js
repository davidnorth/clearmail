import fs from 'fs';
import yaml from 'js-yaml';
import { configureLogger } from './logger.js';

let cachedConfig = null;

export function loadConfig(filePath = './config.yml') {
  if (cachedConfig) return cachedConfig;

  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw);

  const config = {
    globalRules: {
      keepIf: parsed.globalRules?.keepIf || '',
      rejectIf: parsed.globalRules?.rejectIf || '',
    },
    categories: (parsed.categories || []).map(c => ({
      label: c.label,
      keepIf: c.keepIf || '',
      rejectIf: c.rejectIf || '',
    })),
    whitelist: parsed.whitelist || [],
    blacklist: parsed.blacklist || [],
    provider: {
      baseURL: parsed.provider?.baseURL || process.env.PROVIDER_BASE_URL || 'https://api.deepseek.com/v1',
      apiKey: parsed.provider?.apiKey || process.env.PROVIDER_API_KEY || '',
      model: parsed.provider?.model || process.env.PROVIDER_MODEL || 'deepseek-chat',
      maxTokens: parsed.provider?.maxTokens || 500,
    },
    behavior: {
      pollIntervalSeconds: parsed.behavior?.pollIntervalSeconds ?? 120,
      maxEmailChars: parsed.behavior?.maxEmailChars ?? 750,
      maxEmailsPerBatch: parsed.behavior?.maxEmailsPerBatch ?? 50,
      dryRun: parsed.behavior?.dryRun ?? false,
      markRejectedRead: parsed.behavior?.markRejectedRead ?? true,
      starKept: parsed.behavior?.starKept ?? true,
      rejectedLabel: parsed.behavior?.rejectedLabel || 'AI Rejects',
      unknownLabel: parsed.behavior?.unknownLabel || 'CATEGORY_UNKNOWN',
      deepBreathSuffix: parsed.behavior?.deepBreathSuffix ?? false,
    },
    logging: {
      level: parsed.logging?.level || 'info',
      format: parsed.logging?.format || 'plain',
    },
    server: {
      enabled: parsed.server?.enabled ?? false,
      port: parsed.server?.port ?? 3003,
      apiKey: parsed.server?.apiKey || '',
    },
  };

  configureLogger(config.logging);
  cachedConfig = config;
  return config;
}

export function reloadConfig(filePath = './config.yml') {
  cachedConfig = null;
  return loadConfig(filePath);
}
