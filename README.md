# clearmail v2

An open-source tool that uses AI to filter your Gmail inbox. Write rules in plain English — clearmail classifies every incoming email and applies Gmail labels so you wake up to a clean inbox.

## How it works

1. **Polling** — Every N seconds, clearmail checks for new unread emails via the [Gmail API](https://developers.google.com/gmail/api) (OAuth2, no app passwords).
2. **Pre-filter** — Emails from senders on your whitelist skip the AI entirely and stay in your inbox. Emails on your blacklist are rejected immediately. No API credits wasted on obvious decisions.
3. **Classify** — Everything else goes to the LLM, which reads your per-category rules (written in plain English) and returns a single category plus a one-sentence explanation.
4. **Apply** — Kept emails stay in your inbox (optionally starred) with a category label. Rejected emails are moved out of your inbox to a rejection label.

Clearmail never deletes email — it only adds and removes labels. You can review every decision in Gmail.

## Quick start

### 1. Prerequisites

- Node.js 20+
- A Gmail account
- A Google Cloud project with the Gmail API enabled
- An API key for an OpenAI-compatible LLM (DeepSeek is the default — cheap and fast)

### 2. Google Cloud setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) and create a project.
2. Enable the **Gmail API** at: `https://console.cloud.google.com/apis/library/gmail.googleapis.com`
3. Go to **APIs & Services → Credentials** → Create Credentials → **OAuth client ID**.
4. Choose **Desktop app** as the application type.
5. Copy the **Client ID** and **Client Secret**.

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `PROVIDER_API_KEY` — your DeepSeek (or OpenAI) API key
- `GOOGLE_CLIENT_ID` — from step 2
- `GOOGLE_CLIENT_SECRET` — from step 2

```bash
npm install
npm run setup     # Opens browser for Google OAuth consent, stores refresh token
```

### 4. Customize rules

Edit `config.yml`. Write your rules in plain English:

```yaml
globalRules:
  keepIf: |
    * security alerts, one-time passwords, and login codes
    * direct replies to emails I've sent
  rejectIf: |
    * mass marketing, promotions, sale announcements

categories:
  - label: Financial
    keepIf: |
      * bank statements, transaction alerts, tax documents
    rejectIf: |
      * credit card offers, loan promotions

whitelist:
  - "partner@example.com"
  - "*@mycompany.com"

blacklist:
  - "*@spammy-newsletters.com"
```

### 5. Run

```bash
npm start
```

Clearmail runs continuously and prints a summary each cycle:

```
═══════════════════════════════════════════════════════════
  Starting run at Mon May 11 2026 14:25:00 GMT-0700 (PDT)
═══════════════════════════════════════════════════════════
  [1/3] # KEEP   alice@example.com    "Your flight itinerary"           whitelist
  [2/3] x REJECT noreply@spam.com     "50% off everything!"            Marketing — promotional offer
  [3/3] # KEEP   bank@bank.com        "Monthly statement"              Financial — bank statement
───────────────────────────────────────────────────────────
  Run complete — 3 email(s) in 1.2s
```

Stop with `Ctrl+C`.

## Configuration

### config.yml

| Section | Key | Description |
|---------|-----|-------------|
| `globalRules` | `keepIf` / `rejectIf` | Rules that apply to all emails before per-category rules |
| `categories` | `label`, `keepIf`, `rejectIf` | Categories the LLM chooses from — one per email |
| `whitelist` / `blacklist` | | Addresses or `*@domain.com` wildcards. Whitelist wins if both match. |
| `provider` | `baseURL`, `model`, `maxTokens` | LLM settings (OpenAI-compatible). Falls back to `.env` if omitted. |
| `behavior` | `pollIntervalSeconds` | How often to check for new email (default: 120) |
| | `maxEmailChars` | Max body characters sent to LLM (default: 750) |
| | `maxEmailsPerBatch` | Max emails processed per cycle (default: 50) |
| | `dryRun` | Log actions without modifying Gmail |
| | `markRejectedRead` | Mark rejected emails as read |
| | `starKept` | Star emails that are kept |
| | `rejectedLabel` | Gmail label for rejected emails (default: AI Rejects) |
| | `unknownLabel` | Fallback label when LLM can't classify (default: CATEGORY_UNKNOWN) |
| | `deepBreathSuffix` | Enable the silly-but-effective prompt suffix |
| `logging` | `level` | debug, info, warn, error |
| | `format` | plain or json |
| `server` | `enabled`, `port`, `apiKey` | Optional debug HTTP endpoint (`POST /classify`) |

### .env

| Variable | Description |
|----------|-------------|
| `PROVIDER_BASE_URL` | LLM API base URL (default: DeepSeek) |
| `PROVIDER_API_KEY` | Your LLM API key |
| `PROVIDER_MODEL` | Model name (default: deepseek-chat) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Automatically populated by `npm run setup` |

## LLM provider

Clearmail uses the OpenAI SDK in provider-agnostic mode — any OpenAI-compatible API works.

| Provider | baseURL | model |
|----------|---------|-------|
| DeepSeek (default) | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Anthropic (via compatible proxy) | proxy URL | `claude-sonnet-4-20250514` |

Set these in `.env` or override individual values in `config.yml → provider`.

## Dry-run mode

Test your rules without touching real email:

```yaml
behavior:
  dryRun: true
```

Output lines show `[DRY]` and no Gmail changes are made.

## Tests

```bash
npm test           # Run once
npm run test:watch # Watch mode
```

## PM2 (background process)

```bash
npm install -g pm2
pm2 start src/index.js --name clearmail
pm2 save
pm2 startup   # Auto-start on reboot
```

## Contact

Questions or contributions? Reach out to [Andy Walters](mailto:andywalters@gmail.com).

Project sponsored by [Emerge Haus](https://emerge.haus), a custom Generative AI consultancy & dev shop.
