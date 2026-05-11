#!/usr/bin/env node

// One-time OAuth2 setup script.
// Opens a browser for Google OAuth consent and stores the refresh token in .env.

import 'dotenv/config';
import fs from 'fs';
import http from 'http';
import { exec } from 'child_process';
import { OAuth2Client } from 'google-auth-library';

async function main() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret ||
      clientId === 'your_google_client_id_here' ||
      clientSecret === 'your_google_client_secret_here') {
    console.error('ERROR: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env');
    console.error('1. Go to https://console.cloud.google.com');
    console.error('2. Create a project, enable the Gmail API');
    console.error('3. Create an OAuth 2.0 Client ID (Desktop application)');
    console.error('4. Copy the Client ID and Client Secret into .env');
    process.exit(1);
  }

  const redirectUri = 'http://localhost:3003/oauth2callback';
  const oauth = new OAuth2Client(clientId, clientSecret, redirectUri);

  const authUrl = oauth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.modify'],
    prompt: 'consent',
  });

  console.log('\nOpening browser for Google OAuth consent...');
  console.log('If the browser doesn\'t open, visit this URL:\n');
  console.log(authUrl);
  console.log('');

  openBrowser(authUrl);

  // Start local callback server
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url) return;

      const url = new URL(req.url, `http://localhost:3003`);
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication Failed</h1><p>' + error + '</p><p>You can close this window.</p>');
        server.close();
        reject(new Error('OAuth error: ' + error));
        return;
      }

      const authCode = url.searchParams.get('code');
      if (authCode) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authentication Successful!</h1><p>You can close this window. The refresh token has been saved.</p>');
        server.close();
        resolve(authCode);
      }
    });

    server.listen(3003, () => {
      console.log('Waiting for OAuth callback on port 3003...');
    });

    setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout — browser consent not received within 2 minutes'));
    }, 120000);
  });

  console.log('Received authorization code, exchanging for refresh token...');

  const { tokens } = await oauth.getToken(code);
  const refreshToken = tokens.refresh_token;

  if (!refreshToken) {
    console.error('ERROR: No refresh token received. Try re-running setup with prompt=consent.');
    process.exit(1);
  }

  // Write refresh token to .env
  const envPath = './.env';
  let envContent = '';

  try {
    envContent = fs.readFileSync(envPath, 'utf8');
  } catch {
    envContent = fs.readFileSync('./.env.example', 'utf8');
  }

  const lines = envContent.split('\n');
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('GOOGLE_REFRESH_TOKEN=')) {
      lines[i] = `GOOGLE_REFRESH_TOKEN=${refreshToken}`;
      found = true;
      break;
    }
  }

  if (!found) {
    lines.push(`GOOGLE_REFRESH_TOKEN=${refreshToken}`);
  }

  fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
  console.log('\nRefresh token saved to .env');
  console.log('You can now run: npm start');
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' :
              process.platform === 'win32' ? 'start' :
              'xdg-open';
  exec(`${cmd} "${url}"`, { shell: true });
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
