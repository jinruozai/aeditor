# AI Unified Provider / Transport Plan

## Goal

AIditor AI uses one canonical runtime pipeline. API-key models, Codex Auth,
local bridge, Ollama, and future desktop hosts are all provider transports behind
the same request/response contract.

## Boundaries

- `src/ai/runtime.js` owns turns, streaming message state, tool execution, and
  goal loops.
- `src/ai/request.js` owns canonical request construction: messages, context
  resources, tool specs, skills, permissions, and goal policy.
- `src/ai/adapter.js` owns provider protocol conversion when the provider lacks
  native framework semantics. The current text-tool adapter converts canonical
  messages and tool specs into a Codex-compatible text prompt and parses
  `aiditor_tool_calls` back into framework tool calls.
- `src/ai/provider.js` owns registered auth drivers, transports, and built-in
  connection definitions.
- `tools/ai-bridge.mjs` is transport-only. It handles local auth/CLI/process
  access and forwards already-encoded input to Codex app-server. It must not
  decide context windows, inject tools, or parse tool calls.

## Canonical Flow

```text
agent state
  -> ai.makeRequest()
  -> provider adapter encode
  -> transport send
  -> provider adapter decode
  -> runtime append assistant message
  -> runtime execute tool calls
  -> repeat if needed
```

## Hard Rules

- Context history is built in `src/ai/request.js`, never in bridge.
- Tool schema exposure is built in framework adapters, never in bridge.
- Tool call parsing is built in framework adapters, never in bridge.
- Bridge endpoints return raw/standard provider responses and do not understand
  agent, group, resource, or tool policy semantics.
- New providers must register a connection and reuse the same runtime request
  contract.
