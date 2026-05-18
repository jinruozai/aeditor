# AI Local Bridge

Aiditor keeps browser AI integration split into three layers:

1. `Connection`: provider identity, auth method, transport, model defaults.
2. `Auth driver`: API key, local bridge, subscription bridge, or no auth.
3. `Transport`: OpenAI-compatible HTTP, Anthropic HTTP, generic local bridge, or Codex bridge.

The browser never implements ChatGPT or Claude subscription login directly. Subscription auth is delegated to a trusted local process so the editor does not store browser cookies, scrape web sessions, or expose account tokens to project code.

## Command

Run the bridge from the repository root:

```bash
npm run bridge
```

Default URL:

```text
http://127.0.0.1:8787
```

Environment:

| Variable | Default | Purpose |
|---|---:|---|
| `AIDITOR_AI_BRIDGE_HOST` | `127.0.0.1` | HTTP bind host. Keep loopback for local auth. |
| `AIDITOR_AI_BRIDGE_PORT` | `8787` | HTTP port used by `openai-codex` and local bridge connections. |
| `AIDITOR_CODEX_COMMAND` | `codex` | Command that starts the official Codex app server. |
| `AIDITOR_CODEX_ARGS` | `app-server --listen stdio://` | Arguments for the Codex app server JSONL transport. |
| `AIDITOR_CODEX_CHAT_COMMAND` | empty | Optional override for chat requests. The command receives JSON on stdin and returns JSON or text on stdout. |
| `AIDITOR_CODEX_CHAT_ARGS` | empty | Arguments for `AIDITOR_CODEX_CHAT_COMMAND`. |

## HTTP Surface

All endpoints return JSON and allow local browser CORS.

| Endpoint | Method | Meaning |
|---|---|---|
| `/health` | `GET` | Bridge health check. |
| `/connections` | `GET` | Local bridge connection registry. |
| `/connections/openai-codex/status` | `GET` | Read Codex account state. |
| `/connections/openai-codex/login` | `POST` | Start ChatGPT device-code login through Codex. |
| `/connections/openai-codex/logout` | `POST` | Sign out through Codex. |
| `/connections/openai-codex/models` | `GET` | Return Codex model choices. |
| `/connections/openai-codex/chat` | `POST` | Send an Aiditor AI request through Codex. |
| `/models` | `GET` | Generic bridge alias for model listing. |
| `/chat` | `POST` | Generic bridge alias for chat. |

## Frontend Contract

Framework connections use these ids:

| Connection | Auth | Transport | Use |
|---|---|---|---|
| `openai-codex` | `subscriptionBridge` | `codex-bridge` | ChatGPT/Codex account login through local bridge. |
| `local-bridge` | `localBridge` | `local-bridge` | Project or studio-owned local routing service. |
| `claude-code` | `subscriptionBridge` | `local-bridge` | Placeholder for a Claude Code compatible local service. |

Projects should register their own connections or tools instead of changing framework internals. GameDataEditor can add GDE-specific AI tools while still using the same framework connection and chat panels.

## Security Rules

- Keep the bridge bound to loopback unless deploying behind a trusted local gateway.
- Do not pass subscription tokens into browser settings.
- Browser API keys are allowed only for personal/local use. Shared deployments should use `local-bridge`.
- Subscription login must use official local tooling or a documented provider API. Do not implement cookie scraping.
- The bridge accepts Aiditor request JSON, not arbitrary shell commands. `AIDITOR_CODEX_CHAT_COMMAND` is a developer override for local testing and controlled integrations.

## Current Codex Integration

`tools/ai-bridge.mjs` speaks JSONL JSON-RPC to Codex app-server over stdio:

1. `initialize`
2. `account/read`
3. `account/login/start` with `chatgptDeviceCode`
4. `thread/start`
5. `turn/start`
6. collect `item/agentMessage/delta` until `turn/completed`

If a Codex app-server version changes method names, the bridge fails with a clear HTTP error and can be adapted in one file without changing framework UI code.
