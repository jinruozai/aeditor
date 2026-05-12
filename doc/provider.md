# AI Provider System

The provider system connects the AI runtime to model backends.

It is split into:

```text
connection
auth driver
transport driver
provider helpers
request adapter
stream parser
```

## Connection

A connection is a named model backend configuration.

Implemented APIs:

```js
aeditor.ai.registerConnection(id, spec)
aeditor.ai.createCustomConnection(spec)
aeditor.ai.loadCustomConnections()
aeditor.ai.getConnection(id)
aeditor.ai.listConnections()
aeditor.ai.connectionOptions()
aeditor.ai.setActiveConnection(id)
aeditor.ai.getConnectionConfig(id, overrides)
aeditor.ai.connectionConfigKey(id, key)
aeditor.ai.modelHints(id)
aeditor.ai.refreshModels(id, overrides)
aeditor.ai.sendViaConnection(connectionId, request, context)
```

A connection points to an auth driver and a transport driver.

Connection state is exposed as lightweight signals so UI can render status
without polling:

```js
aeditor.ai.defaultConnection
aeditor.ai.connections
aeditor.ai.connectionModels(connectionId)
aeditor.ai.connectionStatus(connectionId)
```

## Auth Drivers

Implemented API:

```js
aeditor.ai.registerAuthDriver(type, driver)
aeditor.ai.authStatus(connectionId)
aeditor.ai.refreshAuthStatus(connectionId)
aeditor.ai.loginConnection(connectionId, options)
aeditor.ai.logoutConnection(connectionId)
```

Current auth driver types include:

```text
none
apiKey
localBridge
subscriptionBridge
```

## Transport Drivers

Implemented API:

```js
aeditor.ai.registerTransport(type, driver)
```

Current transport types include:

```text
mock
openai-compatible
anthropic
local-bridge
codex-bridge
```

Transport drivers send normalized requests and return normalized assistant
messages, tool calls, usage, and streaming deltas.

## Reliability Contract

Every transport should expose the same operational contract:

```text
timeoutMs
abort
retryPolicy
rateLimitState
capabilities
health
lastError
```

Retries must be bounded and should respect provider status codes such as 429.
Abort must stop local parsing and prevent late chunks from mutating the finished
run. Capability and model discovery may be cached, but cache entries need an
explicit refresh path.

## Streaming

Provider helpers support:

```js
aeditor.ai.provider.requestMaybeStream(url, options, extractDelta)
```

The stream path should emit text, reasoning text, tool call deltas, and usage as
soon as they are parsed. The UI should consume the runtime live state instead of
re-rendering the whole transcript for every chunk.

Stream parsers must tolerate partial chunks, empty keepalive chunks, late usage
metadata, and provider-specific reasoning/tool-call deltas. Parsed events should
carry `runId`, `requestId`, and provider timing metadata so UI, logs, and audit
records can be correlated.

## Request Adapter

The adapter layer converts AEditor messages, rich prompts, images, tools, and
runtime context into provider request payloads.

Implemented helpers include:

```js
aeditor.ai.openAiMessages(request)
aeditor.ai.openAiTools(request)
aeditor.ai.anthropicPayloadMessages(request)
aeditor.ai.anthropicSystem(messages)
aeditor.ai.encodeTextToolRequest(request)
aeditor.ai.decodeTextToolResponse(result)
aeditor.ai.requestWithRuntimeContext(request, context)
```

The text tool protocol is a fallback for models or transports that do not expose
native function calling.

## Usage And Cost

The provider helper can estimate usage cost for known providers:

```js
aeditor.ai.estimateUsageCost(provider, model, usage)
```

Cost estimation is optional metadata. The runtime should still operate when no
price information is available.

Hosts may set request budgets such as maximum tokens, maximum cost estimate, or
maximum wall-clock duration. Budget stops are run failures, not silent truncation.
