# Phase 1 — Arena AI capability analysis

**Checked:** 2026-11-10 · **Platform:** arena.ai (Agent Mode) · **Verdict:** no supported external
agent interface exists today.

This document is the recorded result of the first phase of the project: *find out what Arena AI
actually lets an outside application do before writing any integration code.* It is also the
reason the application is built the way it is.

---

## 1. What was checked

| Capability | Result | Evidence |
| --- | --- | --- |
| Public agent API | **No** | `arena.ai/docs` returns 404. No API reference is published for Agent Mode. Agent Mode is documented as a browser product at `arena.ai/agent`. |
| Official SDK | **No** | No SDK or client library is published for Arena agents. |
| Agent / session execution interface | **No** | No documented endpoint to start, continue or poll an Agent Mode session. |
| Webhooks / triggers | **No** | No documented inbound trigger that could start an agent turn without a human message. |
| Access to existing conversations | **No** | Conversations live behind the browser session; no documented export or read API. |
| Access to model configuration | **No** | Model choice is a per-chat UI control; no documented per-agent configuration object to read. |
| Access to agent tools | **No** | Tools (web search, image generation, sandbox, connectors) are enabled per turn in the UI. |
| Authentication for third-party apps | **No** | No documented machine-to-machine credential for Agent Mode. |
| Terms of use | **Prohibits** | Terms of Use §5(vi): you agree not to *"access the Services through programmatic or automated means or automatically query the Services"*. |

A community CLI references a host named `api.arena.ai`. **This project deliberately does not call
it**: it is undocumented, it is not described as an Agent Mode session API, and using it would run
straight into §5(vi). No scraping, browser automation, cookie replay or reverse engineering is used
anywhere in this codebase.

## 2. What that means for "the same agents"

The requirement was: *the employees must be the exact same agents I use in Arena AI, not imitations.*
Given the findings above, an external web application **cannot** reach the exact Agent Mode sessions
that run in your browser. Any product claiming otherwise would be doing one of these:

1. driving the Arena UI with an automated browser (prohibited by the ToS, and brittle), or
2. quietly swapping in a different model or provider (which is exactly what this project was told not to do).

This project takes the third option: it is an **honest adapter**.

Each employee stores a real agent reference and an endpoint. Every message, task and meeting turn is
an actual HTTP call to that endpoint, and the reply that comes back is what you see. Nothing is
generated locally unless you explicitly bind an employee to the *simulation* endpoint, which is
labelled as simulation in the office, in the chat, on the task card and in the dashboard totals.

If no endpoint is bound, the employee is **Offline** and the call is refused. No replies are invented.

## 3. The three supported transports

### a. OpenAI-compatible endpoint (`kind: "openai"`)

```
POST {baseUrl}{path}          // path defaults to /chat/completions
Authorization: Bearer <key stored server-side>
{ "model": "<model>", "messages": [{ "role": "user", "content": "…" }], "agent": "<agent ref>" }
```

Reply is read from `choices[0].message.content` (also `output_text`, `content`, `result`,
`data.content`, …). Model discovery uses `GET {baseUrl}/models`.

This is the transport most private agent runtimes and gateways speak. If Arena ever publishes a
documented credential for such a gateway, you can point this endpoint at it **with your own key**
and nothing in this application needs to change.

### b. Templated HTTP endpoint (`kind: "custom"`)

For runtimes with their own protocol:

```
URL template:   https://my-runtime/agents/{{agent_id}}/invoke
Body template:  {"agentId":"{{agent_id}}","input":"{{prompt}}"}
Response path:  data.output
```

Placeholders: `{{agent_id}}`, `{{agent}}`, `{{agent_name}}`, `{{model}}`, `{{messages}}`,
`{{prompt}}`, `{{system}}`, `{{task}}`. When the template is JSON and a placeholder sits inside a
quoted string, values are JSON-escaped (so multi-line task prompts cannot corrupt the body).

### c. Local simulation (`kind: "simulation"`)

Generates placeholder text in the app. It is never counted as a connected agent, is labelled
`SIMULATED` everywhere, and exists so the interface can be explored before any real endpoint exists.

## 4. The bridge (`bridge/`)

`bridge/arena-bridge.mjs` is a local OpenAI-compatible server you run yourself. It is a *plug socket*:
it forwards each call to something you are entitled to call, with credentials that never leave your
machine.

```
bridge/config.json
{
  "agents": {
    "agent_orion_001": { "upstream": "https://your-gateway/v1/chat/completions", "model": "x", "keyEnv": "ORION_API_KEY" },
    "agent_lyra_007":  { "adapter": "example-adapter.mjs" }
  }
}
```

Unconfigured agents get `501` with a message explaining exactly what is missing — never a fabricated
answer. Point the office at `http://127.0.0.1:8787/v1` with model `agent_orion_001`.

The adapter file is where you wire your own authorised access if you have any. It ships as a template
that throws, on purpose.

## 5. Authentication and secrets

* Endpoint API keys are written to `data/secrets.json` (mode `0600`, git-ignored) and are **never**
  serialised into an API response. The client only ever sees `hasKey: true/false`.
* No key is ever embedded in the frontend bundle.
* No Arena credential is requested, stored or used by this application. Do not paste an Arena session
  cookie into it.
* Deleting an endpoint deletes its key and disconnects the employees bound to it.

## 6. What is genuinely preserved, and what cannot be

| Requirement | Status |
| --- | --- |
| Actual AI model used by the agent | Preserved — the model string is sent to your endpoint unchanged. |
| Agent identity | Preserved — the agent reference stored per employee is sent as `agent` / `{{agent_id}}`. |
| System instructions | **Not injected.** The office never prepends or replaces your agent's instructions. A reference copy can be stored for display. |
| Tools / capabilities | Determined entirely by your endpoint. The office adds no tools and removes none. |
| Conversation history | Stored per employee by this app. Arena's own history cannot be imported (no read API). |
| Integrations | Belong to your endpoint. |
| Response behaviour | Exactly whatever your endpoint returns; errors are shown verbatim. |

## 7. Multi-agent collaboration and meetings

Arena exposes no agent-to-agent channel, so the office does not pretend one exists:

* **Projects** create one real task per employee, chained. When step *N* completes, its actual output
  is appended to step *N+1*'s prompt as "Upstream results". A host-mediated handoff, clearly labelled.
* **Meetings** are host-relayed. Your message plus the transcript so far is sent to each participant;
  each reply is appended in order. The UI and the meeting record both state
  `"relay": "host"` and explain that agents do not talk to each other directly.

## 8. Re-checking later

If Arena publishes an agent API:

1. `GET /api/integration-info` is a static report; update `server/index.mjs` with new findings.
2. If the API is OpenAI-shaped, add the base URL and your key in **Connections** and you are done.
3. If it uses its own shape, add a `custom` endpoint (URL/body/response path) — no code changes.
4. If it needs OAuth, add the token exchange to the bridge adapter and keep the office pointed at
   `http://127.0.0.1:8787/v1`.
