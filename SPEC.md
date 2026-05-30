# Clearmail v2 Specification

## Problem Statement

A user's Gmail inbox accumulates a high volume of newsletters, promotions, receipts, job listings, and personal messages. Manually sorting these into labels is tedious and inconsistent. An LLM-powered filter can classify emails automatically, but existing solutions (like clearmail v1) rely on insecure IMAP connections, lack deterministic pre-filtering to save API costs, and have a flat rules structure that makes it hard to express per-category intent.

## Solution

A long-running Node.js process that uses the Gmail API (OAuth2) to fetch incoming mail, applies a deterministic whitelist/blacklist to skip LLM calls where possible, classifies the remainder via an OpenAI-compatible LLM using per-category natural-language rules, and applies Gmail labels accordingly. The user expresses rules in a YAML config file using plain English.

## User Stories

### Core filtering

1. As a user, I want emails from specific senders or domains to always be kept, so that messages from my partner, boss, and close colleagues never get misfiled.
2. As a user, I want emails from specific senders or domains to always be rejected, so that persistent spammy newsletters skip the LLM entirely.
3. As a user, I want to write natural-language rules for what belongs in each category (e.g. "Financial", "Job Opportunities"), so that I can express intent without writing code.
4. As a user, I want rejected emails moved to a label/folder (not deleted), so that I can review them later if needed.
5. As a user, I want kept emails to stay in my inbox or be starred, so that I notice them.
6. As a user, I want emails that match whitelist rules to bypass the LLM entirely, so that I don't waste API credits on obvious keeps.

### LLM classification

7. As a user, I want the LLM to assign exactly one category per email from a list I define, so that I control the folder structure.
8. As a user, I want the LLM to provide a one-sentence explanation for each classification, so that I can audit its decisions.
9. As a user, I want to set a global keep/reject baseline, so that categories only refine placement and don't have to repeat common rules.
10. As a user, I want to use DeepSeek (or any OpenAI-compatible provider) by setting a base URL and API key, so that I'm not locked into OpenAI.
11. As a user, I want a configurable max token count for the email body sent to the LLM, so that I can balance cost vs accuracy.
12. As a user, I want the LLM response parsed robustly even if the model adds markdown fences or trailing text, so that flaky JSON doesn't crash the process.

### Security

13. As a user, I want authentication via OAuth2 (not an app password), so that my credentials follow Google's security model.
14. As a user, I want API keys and tokens stored in environment variables or a credentials file (never committed to git), so that my secrets stay private.
15. As a user, I want the Express debug endpoint to require an API key or be disabled by default, so that random network traffic can't trigger processing.

### Operations

16. As a user, I want the process to check for new email on a configurable interval, so that it runs continuously without cron.
17. As a user, I want a dry-run mode that logs what would happen without modifying any emails, so that I can test rules safely.
18. As a user, I want structured logging (timestamp, level, message) so that I can troubleshoot and monitor behavior.
19. As a user, I want to process a single email on demand via an HTTP endpoint, so that I can test rule changes.
20. As a user, I want a `CATEGORY_UNKNOWN` fallback label for emails the LLM can't classify, so nothing gets silently dropped.

### Configuration

21. As a user, I want a `.env.example` that ships with sensible defaults for DeepSeek, so that I can get started quickly.
22. As a user, I want the whitelist and blacklist to support exact email addresses and domain wildcards (e.g. `*@example.com`), so that I can match whole organizations.
23. As a user, I want per-category rules to include both `keepIf` and `rejectIf` guidance, so the LLM understands what belongs and what doesn't.
24. As a user, I want a `globalRules` section for rules that span all categories, so that I don't repeat myself.

---

## Implementation Decisions

### Module: Gmail Transport

- Uses `@googleapis/gmail` (official Google SDK) instead of raw IMAP.
- OAuth2 flow: the user runs a one-time setup script that opens a browser, completes the consent screen, and stores a refresh token. The transport uses the refresh token to obtain short-lived access tokens automatically.
- The transport exposes: `fetchUnread(since)`, `addLabels(messageId, labels)`, `removeLabels(messageId, labels)`, `markRead(messageId)`, `star(messageId)`.
- Labels are created automatically if they don't exist (idempotent).
- Gmail API quota: batch operations where possible, respect rate limits.
- Push notifications (Gmail Pub/Sub watch) are out of scope for v2 — polling is sufficient.

### Module: Rules Engine

- Deterministic pre-filter runs before any LLM call.
- Whitelist/blacklist supports exact matches (`alice@example.com`) and domain wildcards (`*@example.com`). Wildcards match the domain and all subdomains.
- Subject pattern matching via regex (configurable, off by default).
- If an email matches both whitelist and blacklist, whitelist wins.
- Pre-filter result can include a target label (e.g., whitelist entry `alice@example.com -> Personal`).
- The rules engine also builds the structured LLM prompt from the config.
- Unknown/unclassifiable emails go to a configurable fallback label.

### Module: LLM Classifier

- Provider-agnostic: takes `baseURL`, `apiKey`, and `model` from config.
- Sends a system prompt describing the task, then a user message with the email content, global rules, and per-category rules.
- Expects a JSON response: `{ meets_criteria, category, explanation }`.
- Parsing is robust: strips markdown fences, handles trailing text, retries on parse failure.
- Timeout: configurable (default 30s). Retries: 2 with exponential backoff.
- Temperature: 0 (deterministic classification preferred).

### Module: Orchestrator

- On startup: load config, validate Gmail auth, ensure labels exist, load last timestamp.
- Main loop: fetch unread since last timestamp -> pre-filter each -> classify remainder via LLM -> apply labels -> save timestamp -> sleep until next interval.
- Dry-run mode: logs actions instead of executing them.
- Structured logging with levels (debug, info, warn, error) and timestamps. Can output JSON or plain text.
- Graceful shutdown on SIGTERM/SIGINT.

### Module: Config Schema

- Extended YAML with: `globalRules`, `categories` (each with `label`, `keepIf`, `rejectIf`), `whitelist`, `blacklist`, `provider` section, `behavior` section.
- `.env` for secrets: `PROVIDER_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`. Config file references no secrets.
- `.env.example` ships with DeepSeek defaults (`baseURL: https://api.deepseek.com/v1`).
- No personal data committed to the repo.

### OAuth2 Setup

- One-time setup script (`setup-auth.js`) that:
  1. Reads Google Cloud project credentials from `.env`.
  2. Opens browser for OAuth2 consent (Gmail read/write scope).
  3. Receives callback, exchanges code for refresh token.
  4. Stores refresh token in `.env`.
- The user must create a Google Cloud project and enable the Gmail API. A setup guide is included in the README.

---

## Testing Decisions

- Tests focus on external behavior, not implementation details.
- **Rules Engine** is the highest-priority test target: it's pure logic (no network), testable in isolation, and correctness matters.
- **LLM Classifier** prompt-building and response-parsing are tested with canned inputs and outputs.
- Gmail Transport and Orchestrator are integration-tested against a mock Gmail API.
- Test framework: `vitest` (fast, modern, compatible with ESM).
- Tests live in `tests/` and are named `*.test.js`.
- Run via `npm test` and `npm run test:watch` during development.

---

## Out of Scope

- Gmail Pub/Sub push notifications (polling only for v2).
- A web UI or dashboard.
- Multi-user support.
- Non-Gmail email providers.
- Email content analysis beyond the first N characters (no full-body classification).
- Automatic label creation in the Gmail UI (the user creates labels manually or the setup script lists existing ones).
- Docker/container deployment (but the code should be container-friendly).

---

## Further Notes

- The existing v1 prompt structure ("take a deep breath, $100,000 reward") is kept as an optional prompt suffix since empirical evidence suggests it improves classification quality with some models. It is configurable (on/off) and documented as a sharp edge.
- The v1 `fixJSON()` function is preserved and extended to handle a broader set of common LLM output quirks.
- Node.js 20+ required (LTS as of 2026).
- ESM modules (`"type": "module"` in package.json) — the v1 CJS style is dropped.
