# Arena Virtual Company

A top-down 2D virtual office where **your** agents work as employees. You are the CEO: walk the
floor, click a character, assign real tasks, hold meetings, rearrange the furniture.

The office is a real canvas scene — procedural pixel-art rooms, pathfinding characters, a camera,
a minimap and a layout editor. The employees are not decoration: each one holds a reference to a
concrete agent and an endpoint the app actually calls.

> **The honest part, first.** Arena AI (arena.ai) publishes no agent API, SDK, webhook or session
> protocol, and its Terms of Use §5(vi) prohibit programmatic access to the service. An outside app
> therefore **cannot** drive the exact Agent Mode sessions running in your browser, and this project
> will not pretend it can, will not automate the Arena UI, and will not swap in a different model
> behind your back. Instead every employee is bound to an **endpoint you control** — point it at your
> own bridge, gateway or private agent runtime. If nothing is bound, the employee is *Offline* and
> refuses to answer. Full analysis: [`docs/ARENA-INTEGRATION.md`](docs/ARENA-INTEGRATION.md).

---

## Quick start

```bash
npm install
npm run build
npm start           # http://localhost:4173
```

Development (Vite + API proxy):

```bash
npm start           # terminal 1 — API on :4173
npm run dev         # terminal 2 — UI on :5173
```

On first launch the office opens with **8 demo placeholders**. They are labelled *Placeholder* on
every card, above their characters and in the dashboard counts. Connect an endpoint, hire your real
agents, then remove the placeholders from **Connections → Remove all placeholders**.

---

## Connecting an agent

1. Open **Connections** (link icon in the top bar).
2. **Add endpoint** → choose a transport:

| Transport | Use it for |
| --- | --- |
| OpenAI-compatible | Any `/chat/completions` endpoint: self-hosted bridge, gateway, private runtime. |
| Custom / templated | A runtime with its own request shape (`{{agent_id}}`, `{{prompt}}`, response path). |
| Local simulation | Exploring the UI only. Never counted as connected, always labelled. |

3. **Verify with a message** — this sends one real request and stores the outcome.
4. **Add employee** → pick the endpoint, paste the agent reference your runtime uses, pick a
   department. The new character walks into the office and takes a free desk.

**Fastest working example** (a 20-line local agent):

```bash
node -e '
const http=require("http");
http.createServer((req,res)=>{
  let b="";req.on("data",c=>b+=c);req.on("end",()=>{
    const p=JSON.parse(b||"{}");
    res.end(JSON.stringify({choices:[{message:{content:"Hello from "+(p.agent||"an agent")}}]}));
  });
}).listen(4999,()=>console.log("mock agent on 4999"));
'
```

Then add an endpoint with base URL `http://127.0.0.1:4999` and path `/v1/chat/completions`
(the mock ignores the path), model `any`, agent reference `agent_demo_1`.

### Keeping credentials on your machine

`bridge/arena-bridge.mjs` is a local OpenAI-compatible **plug socket**:

```bash
cp bridge/config.example.json bridge/config.json     # then edit
node bridge/arena-bridge.mjs                         # http://127.0.0.1:8787
```

Each agent maps to an `upstream` (with `keyEnv` naming an environment variable) or to an `adapter`
module you write. Unconfigured agents return `501` with an explanation — never a fake answer. Point
the office at `http://127.0.0.1:8787/v1`.

---

## What is in the office

**Environment** — 1800 × 1240 world, 11 rooms, two corridors, windows, 33 workstations, 49 props.
CEO office with a company-overview display, reception, meeting room, lounge, and eight departments
(*Executive, Software Development, Marketing, Research & Analysis, Administration, Data Management,
Creative, General Operations*). Every floor tile, wall, plant and character is drawn procedurally at
runtime; nothing is a static image.

**Employees** — hair styles, skin tones, shirts, trousers and accessories, four directions, and
poses for *idle, walk, sit, type, think, meeting*. The pose follows real state: typing only while a
task is genuinely running, meeting only while a meeting is live, a dimmed figure when the agent is
offline.

**Interaction** — click a character (or a desk with an owner) for the employee panel: agent identity,
organisational role, workstation, chat, task history, appearance. Double-click opens the chat.
Drag to pan, wheel to zoom, minimap to jump, `F` to focus, `+/-` to zoom, `Esc` to close.

**Work** — task composer with objective, instructions, expected output, priority, deadline and text
attachments; statuses `pending → assigned → running → waiting → completed / failed / cancelled`;
results stored verbatim with timestamps, model and agent reference. Failures keep the upstream error
string and are never shown as success.

**Collaboration** — projects chain one real task per employee, passing each actual output forward as
context; meetings are host-relayed with a transcript, and both are labelled as relayed because Arena
has no agent-to-agent channel.

**Customisation** — layout editor: drag furniture, desks and whole rooms; add furniture from a
library; add workstations and rooms; resize rooms; reassign desks; move employees between departments;
reset the floorplan. Everything is saved server-side and restored on reload.

---

## Art direction

The office is generated at runtime — there are no image assets, so every pixel is code in
`src/engine/sprites.ts`. That keeps the file small and lets the building grow when you add rooms.

**Palette.** Cool slate architecture (`#3c4655` walls, `#232b36` reveals), warm oak millwork
(`#7c6144`), walnut and brass in the executive suite (`#4a3527` / `#c2a05a`), muted sage for
positive states and a single cyan accent (`#5cc8e8`) reserved for live agent activity. Department
colour is mixed into the floor at 5.5% and appears again in the floor inlay, the wall plate and the
sign in the corridor, so a room's identity reads without shouting.

**Materials.** Four floor systems, each drawn with a cached pattern tile: oak planks with grain and
seams, woven carpet with pile speckle, limestone tile with grout and bevel, and poured concrete with
aggregate and expansion joints. Where a room is carpeted the north wall is glazed instead of solid,
which is what gives the departments their open-plan feel.

**Light.** One direction, top-left. Windows cast daylight bands and slanted shafts over the top-row
rooms, each room gets a ceiling pool (warm in the CEO suite and lounge, neutral elsewhere), corridors
get their own pools, and furniture sits on soft contact shadows. Characters have a radial shadow.

**Characters.** Drawn into a 2× offscreen canvas and cached per appearance/pose/direction. Standing
height ≈ 91px, seated ≈ 64px, so a seated employee clears the room's top wall. Poses: idle, walk
(two-frame), sit, type, think, meet, talk. Faces, hair styles (short, side, buzz, bob, bun, curly,
long), glasses and headsets all come from the stored appearance, so the panel portrait and the person
in the office are always the same character.

**Interface.** Inter Variable (self-hosted via `@fontsource-variable/inter`, no network at runtime),
a 10/14px radius scale, one shadow ramp, 130–200 ms transitions, and a single override block at the
end of `styles.css` that re-skins components without touching layout. Charts and the employee
portrait are drawn from stored records — the dashboard donuts count employees and tasks, nothing is
sampled or estimated.

## Architecture

```
src/engine/            Canvas renderer (no engine dependency)
  layout.ts            Furniture footprints, walk grid, A* + path smoothing
  sprites.ts           Floors, walls, windows, furniture, characters, overlays
  OfficeScene.ts       Camera, actor state machine, depth sorting, picking, editor
src/ui/                React panels (dashboard, directory, tasks, departments,
                       projects, activity, settings, employee, meeting, editor)
src/lib/store.tsx      Snapshot polling, actions, toasts
server/index.mjs       REST API, task runner, meetings, static hosting
server/providers.mjs   Integration layer: openai / custom / simulation transports
server/db.mjs          JSON store with atomic writes; keys in secrets.json (0600)
server/seed.mjs        Floorplan, departments, workstations, demo placeholders
bridge/                Local OpenAI-compatible plug socket + adapter template
scripts/               smoke-test.mjs, verify-layout.mjs, render-preview.mjs
```

The client polls `/api/state` every 1.8 s and renders directly from that snapshot, so the scene and
the data can never drift apart.

## Data and secrets

```
data/arena-office.json    the company (git-ignored)
data/secrets.json         endpoint API keys, chmod 600 (git-ignored)
```

Atomic writes, debounced. Restart the server and the company, agent references, task history,
conversations, meetings and layout come back. Keys are never returned by the API — the client learns
only `hasKey`.

## Verifying it

```bash
npm test                   # guard + layout + integration + UI + pixels (93 checks)
npm run test:integration   # 52 API checks against a mock agent runtime
npm run test:ui            # 34 checks: mounts the React app in JSDOM and drives it
npm run test:render        # 8 checks: runs the built bundle and reads back real pixels
npm run test:layout        # reachability of every desk/meeting seat
npm run preview:render     # renders preview-office.png headlessly
```

The integration test spins up a mock OpenAI-compatible runtime and a throwaway data directory, then
checks: endpoint verification, model discovery, employee binding, chat, task success **and** failure,
unlinked employees refusing to answer, custom templates, project chaining with real upstream context,
meetings, layout persistence, restart recovery, disconnect/reconnect, endpoint deletion. The UI test
mounts the real bundle in JSDOM with a stubbed canvas and a shimmed `fetch`, then clicks through
onboarding, the dashboard, the directory, an employee panel, a real chat round-trip, task creation,
connection settings and the layout editor, failing on any runtime error. Both exit non-zero on failure.

The render probe is the one that catches "it loads but the screen is black": it runs the built
bundle against a real server with a native rasteriser behind every canvas, then asserts the office
canvas is viewport-sized and actually painted, writing `preview-browser.png` as evidence.

> `scripts/assert-clean.mjs` runs before every build. It fails if a stray compiled `.js` file appears
> inside `src/` — Vite resolves `.js` before `.tsx`, so one emitted file silently ships an old bundle.

## Limits, stated plainly

* Arena Agent Mode sessions cannot be reached. See §1 of the integration doc.
* Conversation history from Arena cannot be imported (no read API).
* Attachments are inlined as text; binary upload depends on your endpoint.
* Meetings and projects are host-relayed, not peer-to-peer.
* The office is desktop-first; on narrow screens panels become bottom sheets and the minimap hides.
