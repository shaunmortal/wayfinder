# Raasta · रास्ता

**Indoor and campus wayfinding for hospitals and public buildings in Madhya Pradesh.**
Scan a QR code, say where you need to go in Hindi, Hinglish or English, and follow a step-by-step route on a
2D or 3D map, with a real photo of each turn. No app install, no beacons: a building's map is traced from one
photo of the fire evacuation plan that is already on its wall.

> Hackathon prototype. Not an official app of AIIMS or any hospital. Room sizes are approximate.
> "Demo City Hospital" is a made-up, AIIMS-sized building (4 blocks round a garden, 4 floors, ~190 rooms).

## What it does

| | Feature |
|---|---|
| 🧭 | Shortest route across floors, using lifts or stairs; **step-free** (wheelchair) and **"lift not working"** options |
| 🏥 | Search by department, room number, test, pharmacy, toilets… in English, Hindi or Hinglish, fully offline |
| 🤖 | **Claude understands free text**: "mausa ko blood chahiye" → Blood Bank, 1st floor, by lift |
| 📷 | **"Where am I?" from a photo** of the nearest sign or door (Claude vision reads it and sets your position) |
| 🗺️ | 2.5D floor map and a Three.js **3D view**: furniture in every room, trees, stacked floors for multi-floor routes, arrows flowing along the route |
| 🔀 | **Real shortest paths**: corridors form a ring with a garden walkway and a skywalk, so most trips have 2–3 routes; Dijkstra picks the shortest from where you stand |
| 🏙️ | Three map styles: **2D**, **3D** and **Real 3D** (painted walls, tiled floors, a door with a room-number sign on every room, stair flights, lift doors, building facades, trees, sky and shadows). Tap a room in Real 3D to stand in front of its door |
| 🚶 | **Crowd-aware routes**: two route options with crowd info. Offline: the hospital's usual busy hours + spreading visitors over near-equal routes. Online: an anonymous live count per corridor (10+ walkers → the next visitor gets the other route), falling back to offline in 2.5 s |
| 📄 | **OPD slip (parchi) photo**: snap the slip, Claude reads the department / room (not the patient's details) and the route starts |
| 🚧 | **Problems on the way**: say or tap "lift not working", "way ahead is blocked" or "can't take stairs" mid-walk and get a new route from where you are (offline) |
| 🎙️ | **Mic input**: say where you need to go in Hindi or English; it goes through the same search / Claude flow |
| 🖼️ | **Real photo** of each turn in the step-by-step view (faces blurred); where there is no photo, a **first-person Real 3D view** of that exact turn (room signs, a blue floor stripe to follow), in sync with the map |
| 🔊 | Directions **read aloud** in Hindi (hi-IN) or English (en-IN) |
| 💬 | **Feedback**: 1–5 rating + optional comment (Hindi or English), asked once after the first arrival and always reachable from the menu / Help. The team reads it at `/api/feedback?key=<FEEDBACK_KEY>` |
| 🔗 | **QR deep links**: every QR card opens the page at that exact spot (`#<spot-id>`); printable A4 sheets |
| 🌗 | Light and dark themes, phone layout with bottom tab bar |

AI is optional: without an API key, or when Claude is unreachable, the app still searches and routes everything on the
phone (tested for every spot → every place in all three buildings), and the Claude-only buttons simply don't appear.
After the first visit a service worker keeps the app, all building data and photos available with no internet.
Help → **Offline demo** switches Claude off on purpose to show this. The key stays on the server; the browser only calls our own `/api/*` endpoints.

## Run it

Requires Node 20+.

```bash
npm install
cp .env.example .env        # optional: add ANTHROPIC_API_KEY to turn on the Claude features
npm run dev                 # app + api on http://localhost:5173
```

| Script | |
|---|---|
| `npm run dev` | dev server: app and `api/` handlers together |
| `npm test` | Vitest: routing, data checks, UI smoke test (jsdom), API handlers with a mocked Claude |
| `npm run lint` | `tsc --noEmit` (strict) + Prettier check |
| `npm run build` / `npm run preview` | production build in `dist/` and a local preview (with the api) |

Environment (`.env`, never committed):

| Variable | Default | Used for |
|---|---|---|
| `ANTHROPIC_API_KEY` | (none) | Claude features; without it they are hidden |
| `CLAUDE_MODEL` | `claude-haiku-5-5` | `/api/ask`: free text → destination |
| `CLAUDE_VISION_MODEL` | `claude-sonnet-5-5` | `/api/locate`: photo of a sign → spot |

## How Claude is used

**In the product**
- `POST /api/ask` sends the visitor's words, where they are standing, the building's place list and its
  `aiRules` to Claude and gets back structured JSON (`destination_id`, `start_id`, a one-line reply in English
  and Hindi). Every id is checked against the building data before the page uses it.
- `POST /api/locate` sends a resized photo of a nearby sign; Claude reads the room number or name and matches it
  to one spot. Same id validation.
- Both endpoints have timeouts, a per-IP rate limit and clear error codes; on any error the page falls back to
  the built-in keyword search.

**To build it**
- The working prototype, the hospital data and the build spec (`CLAUDE.md`) were made with Claude.
- Claude Code ported the prototype into this TypeScript project milestone by milestone (engine + tests,
  2D map and panels, 3D view, AI endpoints, QR/phone/dark mode, docs), and a Claude Code sub-agent turned our
  walk-through photos and video into step photos with faces blurred.

## Add a building ("photo se map")

1. Photograph the fire evacuation plan straight on, without glare.
2. `python3 tools/plan_to_lines.py plan.jpg out/` → straightened `rect.png`, `grid.png` and a line drawing.
3. Trace rooms and corridors on `grid.png` into `public/sites/<id>/site.json` (format in `CLAUDE.md`):
   points + walks for corridors, places with doors, lifts/stairs.
4. Add one photo per turn (`photos/`), with no identifiable faces.
5. `npm test` checks ids, links, reachability of every place and that every photo exists.

## Print QR cards

```bash
pip install segno
python3 tools/qrsheet.py hospital https://your-host.example/ qr.html         # gates, lifts, stairs, popular places
node tools/topdf.cjs qr.html qr.pdf                                             # A4 PDF, 6 cards per page
```

## Project layout

```
index.html            app shell
src/data/             site types, loader, validation
src/engine/           graph, Dijkstra routing, step building, step text (en/hi)
src/map2d/ map3d/     2.5D SVG map; Three.js 3D view (loaded on demand)
src/ui/ i18n/ voice/  panels, strings in English and Hindi, speech
src/ai/               offline keyword search; client for the api
api/                  serverless functions: ask, locate, status (+ shared _lib.ts)
public/sites/<id>/    site.json, photos, plan image for each building
tools/                plan tracer, QR sheet, HTML → PDF
tests/                Vitest suites
reference/            the original single-file prototype and source images
```

## Data sources

- **Demo City Hospital:** fictional building for the demo, generated by `tools/gen_hospital.py`.

## Privacy

No accounts, no tracking, no analytics that identify people. Questions and sign photos are sent to Claude only
when the visitor asks Claude, and are not stored by Raasta. The mic uses the browser's own speech recognition
(in Chrome this is processed by the browser vendor's service); typing always works without it.

## Roadmap

See the *Feature roadmap* in [`CLAUDE.md`](CLAUDE.md): WhatsApp share, mic input, patient journey checklist,
attendant info (dharamshala, food, ATM, parking), offline PWA, OPD slip scan, kiosk mode, admin panel and an
anonymous analytics dashboard.
