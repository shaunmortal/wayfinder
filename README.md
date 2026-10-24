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
| 🤖 | **Gemma 4 understands free text**: "mausa ko blood chahiye" → Blood Bank, 1st floor, by lift |
| 📷 | **"Where am I?" from a photo** of the nearest sign or door (Gemma 4 reads the sign and sets your position) |
| 🗺️ | 2.5D floor map and a Three.js **3D view**: furniture in every room, trees, stacked floors for multi-floor routes, arrows flowing along the route |
| 🔀 | **Real shortest paths**: corridors form a ring with a garden walkway and a skywalk, so most trips have 2–3 routes; Dijkstra picks the shortest from where you stand |
| 🏙️ | Three map styles: **2D**, **3D** and **Real 3D** (painted walls, tiled floors, a door with a room-number sign on every room, stair flights, lift doors, building facades, trees, sky and shadows). Tap a room in Real 3D to stand in front of its door |
| 🚶 | **Crowd-aware routes**: two route options with crowd info. Offline: the hospital's usual busy hours + spreading visitors over near-equal routes. Online: an anonymous live count per corridor (10+ walkers → the next visitor gets the other route), falling back to offline in 2.5 s |
| 📄 | **OPD slip (parchi) photo**: snap the slip, Gemma 4 reads the department / room (not the patient's details) and the route starts |
| 🚧 | **Problems on the way**: say or tap "lift not working", "way ahead is blocked" or "can't take stairs" mid-walk and get a new route from where you are (offline) |
| 🎙️ | **Mic input**: say where you need to go in Hindi or English; it goes through the same search / Gemma flow |
| 🖼️ | **Real photo** of each turn in the step-by-step view (faces blurred); where there is no photo, a **first-person Real 3D view** of that exact turn (room signs, a blue floor stripe to follow), in sync with the map |
| 🔊 | Directions **read aloud** in Hindi (hi-IN) or English (en-IN) |
| 💬 | **Feedback**: 1–5 rating + optional comment (Hindi or English), asked once after the first arrival and always reachable from the menu / Help. The team reads it at `/api/feedback?key=<FEEDBACK_KEY>` |
| 🔗 | **QR deep links**: every QR card opens the page at that exact spot (`#<spot-id>`); printable A4 sheets |
| 🌗 | Light and dark themes, phone layout with bottom tab bar |

AI is optional: when Gemma is not running, the app still searches and routes everything on the phone (tested for
every spot → every place in the building), and the AI-only buttons simply don't appear.
After the first visit a service worker keeps the app, all building data and photos available with no internet.
Help → **Offline demo** switches the AI off on purpose to show this. The browser only calls our own `/api/*` endpoints.

## Run it

Requires Node 20+.

```bash
npm install
ollama pull gemma4:e2b-it-qat   # Gemma 4, open weights, runs on the laptop (QAT build fits in 8 GB RAM)
cp .env.example .env            # optional settings, see below
npm run dev                     # app + api on http://localhost:5173  ·  landing page: /landing.html
```

| Script | |
|---|---|
| `npm run dev` | dev server: app and `api/` handlers together |
| `npm test` | Vitest: routing, data checks, UI smoke test (jsdom), API handlers with a mocked model |
| `npm run lint` | `tsc --noEmit` (strict) + Oxlint + Prettier check |
| `npm run build` / `npm run preview` | production build in `dist/` and a local preview (with the api) |

Environment (`.env`, never committed):

| Variable | Default | Used for |
|---|---|---|
| `GEMMA_MODEL` | `gemma4:e2b-it-qat` | the Gemma 4 build Ollama runs for `/api/ask`, `/api/locate`, `/api/slip` |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | where Ollama is listening |
| `GEMINI_API_KEY` | (none) | optional: run the same Gemma 4 hosted on Google's Gemini API (`gemma-4-26b-a4b-it`) instead of Ollama — for laptops too slow to run it locally |
| `FEEDBACK_KEY` | (none) | lets the team read visitor feedback at `/api/feedback?key=…` |

## How Gemma 4 is used

Gemma 4 does the **understanding**; a plain shortest-path algorithm does the **routing**. A language model can invent a
corridor that does not exist, which is dangerous in a hospital, so the model only ever picks one id from this building
and Dijkstra draws the way.

| Endpoint | Gemma 4 gets | Gemma 4 returns |
|---|---|---|
| `POST /api/ask` | the visitor's words (Hindi, Hinglish or English), where they stand, the building's place list and its `aiRules` | `destination_id`, `start_id`, a short reply in English and Hindi |
| `POST /api/locate` | a resized photo of a nearby sign + the list of spots | the spot id whose room number / name is on the sign, and the text it read |
| `POST /api/slip` | a photo of an OPD slip / prescription + the place list | the department or room id it sends the patient to (never the patient's details) |

- Runs locally through Ollama (`gemma4:e2b-it-qat`): no API key, no per-request cost, and photos of slips never leave
  the hospital's machine. With a `GEMINI_API_KEY`, the same calls go to Gemma 4 hosted on the Gemini API
  (`gemma-4-26b-a4b-it`, structured output via `responseJsonSchema`).
- Every call sends a JSON Schema (from zod) as Ollama's `format`, at `temperature: 0` and an 8k context, so the
  answer is valid JSON; it is parsed again with zod.
- Every id is checked against the building data before the page uses it; unknown ids are dropped.
- Timeouts, a per-IP rate limit and image size/type checks on every endpoint; on any error the page falls back to the
  built-in keyword search.

Built with help from Claude Code during development.

## Add a building ("photo se map")

1. Photograph the fire evacuation plan straight on, without glare.
2. `python3 tools/plan_to_lines.py plan.jpg out/` → straightened `rect.png`, `grid.png` and a line drawing.
3. Trace rooms and corridors on `grid.png` into `public/sites/<id>/site.json` (types in `src/data/types.ts`, checked by `src/data/validate.ts`):
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
reference/            source image (fire-evacuation plan photo)
```

## Data sources

- **Demo City Hospital:** fictional building for the demo, generated by `tools/gen_hospital.py`.

## Privacy

No accounts, no tracking, no analytics that identify people. Questions and photos go only to the hospital's own
Gemma 4 (running locally through Ollama) when the visitor asks the AI, and are not stored by Raasta. The mic uses the browser's own speech recognition
(in Chrome this is processed by the browser vendor's service); typing always works without it.

## Roadmap

Pilot in a real hospital, more automatic plan tracing, more Indian languages (Gemma is multilingual), live
"lift / corridor closed" updates from staff, WhatsApp share, kiosk mode and an anonymous analytics dashboard.
