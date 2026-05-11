import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { logger } from './logger.js';

let gmailClient = null;
let labelMap = null;

export function createOAuthClient() {
  return new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3003/oauth2callback'
  );
}

export function getGmailClient() {
  if (gmailClient) return gmailClient;

  const oauth = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });

  gmailClient = google.gmail({ version: 'v1', auth: oauth });
  return gmailClient;
}

export async function validateAuth() {
  try {
    const gmail = getGmailClient();
    await gmail.users.getProfile({ userId: 'me' });
    return true;
  } catch (err) {
    logger.error('Gmail auth validation failed', { error: err.message });
    return false;
  }
}

export async function fetchUnread(since) {
  const gmail = getGmailClient();
  const sinceSeconds = Math.floor(since.getTime() / 1000);

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: `is:unread after:${sinceSeconds}`,
    maxResults: 50,
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return [];

  const fullMessages = await Promise.all(
    messages.map(msg =>
      gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      })
    )
  );

  return fullMessages.map(m => parseGmailMessage(m.data));
}

export async function addLabel(messageId, labelName) {
  const labels = await ensureLabelsExist();
  const labelId = labels.get(labelName);
  if (!labelId) {
    throw new Error(`Label "${labelName}" not found and could not be created`);
  }

  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: [labelId] },
  });
}

export async function removeLabel(messageId, labelName) {
  const labels = await ensureLabelsExist();
  const labelId = labels.get(labelName);
  if (!labelId) return;

  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: [labelId] },
  });
}

export async function removeInboxLabel(messageId) {
  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['INBOX'] },
  });
}

export async function markRead(messageId) {
  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

export async function starMessage(messageId) {
  const gmail = getGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: { addLabelIds: ['STARRED'] },
  });
}

export async function ensureLabelsExist(names) {
  if (labelMap) return labelMap;

  const gmail = getGmailClient();
  const res = await gmail.users.labels.list({ userId: 'me' });
  const existing = res.data.labels || [];
  labelMap = new Map(existing.map(l => [l.name, l.id]));

  const normalizedNames = (typeof names === 'string' ? [names] : names || []).map(n => n.toLowerCase());

  for (const name of names || []) {
    // Check case-insensitively
    const existingName = [...labelMap.keys()].find(
      k => k.toLowerCase() === name.toLowerCase()
    );
    if (!existingName) {
      try {
        const createRes = await gmail.users.labels.create({
          userId: 'me',
          requestBody: {
            name,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          },
        });
        labelMap.set(name, createRes.data.id);
        logger.info(`Created Gmail label: "${name}"`);
      } catch (err) {
        logger.warn(`Could not create label "${name}": ${err.message}`);
      }
    }
  }

  return labelMap;
}

export function clearLabelCache() {
  labelMap = null;
}

function parseGmailMessage(message) {
  const headers = {};
  if (message.payload?.headers) {
    for (const h of message.payload.headers) {
      headers[h.name.toLowerCase()] = h.value;
    }
  }

  const body = getBodyFromPayload(message.payload);

  return {
    id: message.id,
    threadId: message.threadId,
    from: headers.from || '',
    subject: headers.subject || '',
    date: new Date(parseInt(message.internalDate) || Date.now()),
    body,
    labelIds: message.labelIds || [],
  };
}

function getBodyFromPayload(payload) {
  if (!payload) return '';

  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = decodeBase64(part.body.data);
        return stripHtml(html);
      }
    }
    for (const part of payload.parts) {
      if (part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
  }

  return '';
}

function decodeBase64(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
