# Ruang

A first-person interior design walkthrough of three condo floor plans (Types A, B1 and B).
Walk through a unit, switch between five interior styles, move and swap furniture with
prices in MYR, and change the time of day and the view outside. Experimental; runs as a
local web page on your own computer.

## Status

**Phase 3 (light and views) is ready for you to walk through.**

- **Room lights.** Every room has its own switch, dimmer and colour temperature (warm 2700 K to cool
  5000 K) on the Lighting panel, plus scenes: Auto (lights come on at dusk), Evening, Movie, All on,
  All off. There are real switch plates by the doors: look at one and press <kbd>E</kbd>. Lamps follow
  their room, and a dimmed room looks dimmer (the eye only partly adapts).
- **Four window views.** The KL skyline from level 38, the rainforest from level 5 and the beach from
  level 10 are new, rendered in Blender from scenes built for this project (the mountain is as
  before). Each has a night version: the city's windows and street lamps come on through dusk, the
  garden and pool lights in the forest, the resorts and fishing boats along the beach. The sun
  glitters on the sea, following the real sun (from Type A's north-facing balcony you catch it on
  mornings around June, low to the east-north-east). After sunset the landscape now fades with the
  afterglow, so dusk has a blue hour.
- **Photo Mode.** The camera button (or <kbd>P</kbd>) path-traces the current view: real bounced
  light, soft shadows and reflections, cleaned by Intel's Open Image Denoise and saved as a PNG.
  The walk view stays on screen while it measures the light; a cleaned-up image replaces it after 16
  samples per pixel, again at 64, and the photo is done at 256. The view through the windows keeps
  the brightness you saw while walking, so it doesn't wash out.

The checkpoint for this phase is your walk-through: whether the views and night lighting feel real
from inside the unit, whether the room lights and switches behave as you expect, and how Photo Mode
looks and how long it takes on the Arc 130V.

Phase 3 screenshots (rendered in software here, so softer and with simpler shadows than on your laptop):

| | |
|---|---|
| Room lights | [KL skyline at dusk, Evening scene](docs/previews/phase3-01-city-dusk.jpg) · [Night, lights off](docs/previews/phase3-02-city-night-lights-off.jpg) · [Bedroom dimmed to 30%, 2700 K](docs/previews/phase3-03-bedroom-dimmed.jpg) · [Kitchen at 5000 K beside the warm dining light](docs/previews/phase3-04-kitchen-cool.jpg) |
| Rainforest | [Morning, from the living room](docs/previews/phase3-05-rainforest-day.jpg) · [From the balcony](docs/previews/phase3-06-rainforest-balcony.jpg) · [Night](docs/previews/phase3-07-rainforest-night.jpg) |
| Beach | [Morning, from the living room](docs/previews/phase3-08-beach-day.jpg) · [From the balcony](docs/previews/phase3-09-beach-balcony.jpg) · [Night](docs/previews/phase3-10-beach-night.jpg) · [Sun glitter, a June morning](docs/previews/phase3-11-beach-glitter.jpg) |
| Photo Mode | [The walk view](docs/previews/phase3-12-walk-view.jpg) · [The same view in Photo Mode](docs/previews/phase3-13-photo.jpg) |
| Interface | [Light switch](docs/previews/phase3-ui-switch.jpg) · [Lighting panel](docs/previews/phase3-ui-lighting.jpg) · [Window views](docs/previews/phase3-ui-views.jpg) · [Photo Mode bar](docs/previews/phase3-ui-photo.jpg) |

Known gaps: Photo Mode does not reproduce tile joints and per-plank tone (the path tracer sees plain
textures), needs WebGPU for the denoiser (Chrome or Edge on Windows have it), and its speed is
untested on the Arc 130V; window views are flat images, so there is no parallax as you walk;
furniture can overlap if you put it there; from the balcony end, a hairline can show across the black
leather sofa.

### Phase 2 (furniture)

Type A is furnished in all five
styles, 68 to 70 pieces each: sofas, beds, wardrobes, kitchen modules, bathroom fittings, lamps,
curtains and plants, built in code at their catalogue sizes or taken from CC0 scans. Look at any
piece to see its price, then pick it up, turn it, change its finish, swap it for another from the
catalogue or hide it. The total in the top bar follows every change, and <kbd>Tab</kbd> shows the
plan from above for rearranging.

Starting totals for Type A (estimates in MYR, furniture and fittings only, before renovation):

| Muji | Japanese | Brutalist | Minimalist | Quiet Luxury |
|---|---|---|---|---|
| RM72,089 | RM94,118 | RM119,077 | RM63,707 | RM188,715 |

The balcony faces north, so from late September to mid-March the sun never shines straight in, and
daytime rooms look soft and even. From late March to September it does, low in the mornings and late
afternoons: set the month on the Lighting panel.

Phase 2 screenshots (rendered in software here, so softer and with simpler shadows than on your laptop):

| | |
|---|---|
| Quiet Luxury | [Living room, June 4:30 pm](docs/previews/phase2-01-quiet-luxury-living.jpg) · [From the front door](docs/previews/phase2-02-quiet-luxury-entry.jpg) · [Evening, lamps on](docs/previews/phase2-03-quiet-luxury-night.jpg) · [Bedroom at night](docs/previews/phase2-04-quiet-luxury-bedroom-night.jpg) · [Bathroom, evening](docs/previews/phase2-05-quiet-luxury-bathroom.jpg) |
| Other styles | [Muji living and dining](docs/previews/phase2-06-muji-living.jpg) · [Muji kitchen](docs/previews/phase2-07-muji-kitchen.jpg) · [Japanese living](docs/previews/phase2-08-japanese-living.jpg) · [Japanese bedroom](docs/previews/phase2-09-japanese-bedroom.jpg) · [Brutalist living](docs/previews/phase2-10-brutalist-living.jpg) · [Brutalist study](docs/previews/phase2-11-brutalist-study.jpg) · [Minimalist living](docs/previews/phase2-12-minimal-living.jpg) · [Minimalist bedroom](docs/previews/phase2-13-minimal-bedroom.jpg) |
| Interface | [Price card](docs/previews/phase2-ui-hover.jpg) · [Swap, with price differences](docs/previews/phase2-ui-swap.jpg) · [Catalogue](docs/previews/phase2-ui-catalogue.jpg) · [Bill](docs/previews/phase2-ui-bill.jpg) · [Plan view](docs/previews/phase2-ui-plan.jpg) · [Phone](docs/previews/phase2-ui-phone.jpg) |

Phase 1 screenshots (the empty shell, before furniture):

| | |
|---|---|
| Light | [Living room, 4:30 pm](docs/previews/phase1-01-living-afternoon.jpg) · [Kitchen and service yard](docs/previews/phase1-02-kitchen-yard.jpg) · [Hallway](docs/previews/phase1-03-corridor.jpg) · [Bedroom 1, 9 am](docs/previews/phase1-04-bedroom1-morning.jpg) |
| Time of day | [Golden hour](docs/previews/phase1-05-living-golden-hour.jpg) · [Night, downlights on](docs/previews/phase1-06-dining-night.jpg) |
| Styles | [Muji](docs/previews/phase1-07-muji.jpg) · [Brutalist](docs/previews/phase1-08-brutalist.jpg) · [Japanese](docs/previews/phase1-09-japanese-bedroom.jpg) · [Minimalist](docs/previews/phase1-10-minimal-living.jpg) |
| Interface | [Start screen](docs/previews/phase1-ui-start.jpg) · [Lighting panel](docs/previews/phase1-ui-desktop.jpg) · [Phone](docs/previews/phase1-ui-phone.jpg) |

Phase 0 design references, still current:

| What | Open locally | Preview on GitHub |
|---|---|---|
| Interface mockup (desktop and phone) | `design/ui-mockup/index.html` | [walk + lighting](docs/previews/ui-1-desktop-walk-lighting.jpg) · [catalogue](docs/previews/ui-2-desktop-catalogue.jpg) · [phone](docs/previews/ui-3-phone.jpg) · [design language](docs/previews/ui-4-design-language.jpg) |
| Style mood boards (5 styles + window views) | `design/moodboards/index.html` | [Muji](docs/previews/moodboard-muji.jpg) · [Japanese](docs/previews/moodboard-japanese.jpg) · [Brutalist](docs/previews/moodboard-brutalist.jpg) · [Minimalist](docs/previews/moodboard-minimal.jpg) · [Quiet Luxury](docs/previews/moodboard-quietLuxury.jpg) · [Views](docs/previews/moodboard-views.jpg) |
| Floor plans rebuilt from the CAD sheets | `docs/plans/index.html` | [Type A](docs/previews/plan-type-a.jpg) · [Type B1](docs/previews/plan-type-b1.jpg) · [Type B](docs/previews/plan-type-b.jpg) |
| Furniture catalogue (149 items) | `docs/catalogue.csv` (opens in Excel) | [catalogue.csv](docs/catalogue.csv) |
| How prices were set, with sources | `docs/pricing.md` | [pricing.md](docs/pricing.md) |

The full plan, decisions and assumptions are in [PLAN.md](PLAN.md).

## Getting it onto your laptop (Windows)

1. Install **Git for Windows** from <https://git-scm.com/download/win> (accept the defaults).
2. Install **Node.js LTS** from <https://nodejs.org> (the LTS installer, accept the defaults).
3. Open **Terminal** (Windows PowerShell) and run:

   ```powershell
   git clone https://github.com/kuzeo0227/ruang.git
   cd ruang
   npm install
   ```

   The repository is private, so the first time Git opens a browser window asking you to sign in to GitHub.
4. To get later updates: `git pull`, then `npm install`.

## Running it

```powershell
npm run dev
```

Then open <http://localhost:5173> in Chrome or Edge. The first run downloads about 250 MB of CC0
textures and 3D models from Poly Haven and ambientCG into `public/assets/` (later runs skip this), so
it needs an internet connection once.

To try it on your phone, connect the phone to the same Wi-Fi, run `npm run dev -- --host`, and open the
"Network" address it prints. If Windows asks whether Node.js may use the network, allow it on
**Private networks**.

For the smoothest 3D: keep the laptop plugged in and set Windows power mode to **Best performance**
(Settings → System → Power & battery). If it stutters, open Settings (gear, top right) and choose
**Low** quality; turn on **Show frame rate** to see the effect. **High** is worth trying when plugged in.

### Controls

| | Laptop | Phone (or touching the laptop screen) |
|---|---|---|
| Move | <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrow keys; <kbd>Shift</kbd> to run | Left thumb: the joystick appears where you touch |
| Look | Click the view to capture the mouse (<kbd>Esc</kbd> releases it), or drag | Drag with the right thumb |
| Doors and light switches | <kbd>E</kbd> when "Open door" or "Switch on …" shows under the crosshair (switch plates are beside the doors, 1.3 m up) | Tap the button that appears |
| Tape measure | <kbd>M</kbd> at the start point, <kbd>M</kbd> at the end point | Ruler button |
| Lights | <kbd>L</kbd> turns everything on or off; Lighting → Room lights for each room's switch, dimmer (drag the bar) and colour (tap the dot), and the scenes | Lighting tab |
| Photo Mode | <kbd>P</kbd> or the camera button; **Save** writes a PNG, <kbd>Esc</kbd> or **Close** goes back | Settings → Photo Mode |
| Time of day | <kbd>,</kbd> and <kbd>.</kbd> step 15 minutes; Lighting panel for time, month and presets | Lighting tab |
| Panels | <kbd>1</kbd> Style · <kbd>2</kbd> Furniture · <kbd>3</kbd> Lighting · <kbd>4</kbd> Views · <kbd>Esc</kbd> closes | Tabs at the bottom |

### Furniture

Look at any piece: its price card appears beside it. Every piece can be moved, including kitchen
modules, wardrobes and bathroom fittings.

| | Laptop | Phone |
|---|---|---|
| Pick up / put down | <kbd>E</kbd> (it follows your view: along the floor, onto table tops, flat on walls) | Tap the piece, then **Move**, then **Put down** |
| Rotate 45° | <kbd>R</kbd> (<kbd>Shift</kbd>+<kbd>R</kbd> the other way) | **Rotate** |
| Next finish | <kbd>F</kbd>, or click a swatch on the card | **Finish** |
| Swap for another piece | <kbd>C</kbd> opens the catalogue with prices compared to yours | **Swap** |
| Hide (left off the bill) / remove | <kbd>H</kbd> / <kbd>Delete</kbd> | **Hide** / **Remove** |
| Undo / redo | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>, or the Undo button on the message | Undo on the message |
| Add a piece | Furniture panel → catalogue → click a card, then put it down | Same |
| The bill | Click the green total in the top bar | Same |
| Plan view | <kbd>Tab</kbd> or the Walk / Plan switch: drag pieces, wheel to zoom, drag the floor to pan, double-click to walk there | Walk / Plan switch; pinch to zoom |

Each style keeps its own layout in the browser, so edits survive a reload. The bill has
**Reset to the … layout** to start again.

Settings also has field of view, eye height (set it to your own: about your height minus 12 cm),
exposure, look sensitivity, and "Back to the entrance".

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Runs the walkthrough at <http://localhost:5173> (downloads the textures first if needed) |
| `npm run build` / `npm run preview` | Production build into `dist/`, and a local server for it |
| `npm run fetch:assets` | Downloads the CC0 textures and models into `public/assets/` |
| `npm run check:plans` | Checks the rebuilt floor plans against the CAD area and daylighting tables |
| `npm run check:shell` | Builds the 3D shell of every unit and checks doorways, probes, spawn point and daylight openings |
| `npm run check:furniture` | Builds every code-made piece in every style and finish and checks its geometry and size |
| `npm run check:layouts` | Checks each style's starting layout in every unit: inside the walls, no overlaps, door swings and the balcony door clear |
| `npm run render:plans` | Regenerates the SVG plans and `docs/plans/index.html` |
| `npm run export:catalogue` | Validates the catalogue and writes `docs/catalogue.csv` and `docs/pricing.md` |
| `npm run build:moodboards` | Regenerates `design/moodboards/index.html` |
| `npm run build:mockup` | Regenerates `design/ui-mockup/index.html` |
| `npm run typecheck` | TypeScript check |

The window views are rendered with Blender 4.2 (not needed to run the app; the results are in
`public/backdrops/`). Each view script builds its scene, renders a day pass and a night pass (the
beach also a water mask), and `make_band.py` turns them into the band the app uses:

```
blender -b --factory-startup --python tools/views/city.py -- --out renders/city --mode day --width 6144 --samples 48
blender -b --factory-startup --python tools/views/city.py -- --out renders/city --mode night --width 6144 --samples 32
python tools/views/make_band.py renders/city public/backdrops/city --el-min -80 --el-max 14 --sky-glow 1 --night-peak 0.03
python tools/views/thumb.py public/backdrops/city public/ui/views/city.jpg
```

The other views: `rainforest.py` (band: `--el-min -80 --el-max 50 --visibility 12000 --exposure 0.32
--horizon-haze 0`; thumbnail: `--top 18`) and `beach.py` (also `--mode mask`; band: `--el-min -80
--el-max 15 --visibility 45000 --exposure 0.32 --horizon-haze 0.5 --sea-shade 0.55 --sea-colour
0.27,0.42,0.54`). The same exposure keeps the views lit alike. On a 4-core CPU at 6144 px the rainforest takes about 80 minutes for both passes, the city
and the beach about half an hour each.

## Layout

```
src/plan/          floor-plan data model; one generator builds Types A, B and B1
src/shell/         3D shell from the plan: walls, openings, joinery, collision, lighting zones
src/render/        canvas, materials, sun and sky, daylight, probes, post-processing, walking,
                   furniture in the scene, editing, plan view, catalogue thumbnails
src/furniture/     placements and edits, code-built furniture generators, default layouts
src/ui/            interface (top bar, dock, panels, minimap, touch controls) and design tokens
src/state/         app state
src/catalogue/     materials, style packs, price bands and catalogue items
scripts/           asset download, checks, and generators for docs/ and design/
tools/             make_backdrop.py: turns a CC0 panorama into a window-view band;
                   views/: Blender scenes for the city, rainforest and beach views, and their tools
public/backdrops/  the four window views: band, night lights, water mask
public/oidn/       Open Image Denoise weights for Photo Mode
design/            mood boards and interface mockup
docs/              rebuilt plans, pricing, catalogue CSV, previews, reference sheets
```

## Credits

- Textures, 3D models and panoramas: [Poly Haven](https://polyhaven.com) and [ambientCG](https://ambientcg.com), both CC0.
  The mountain view is built from Poly Haven's "Drakensberg Solitary Mountain" panorama.
- The city, rainforest and beach views are rendered in [Blender](https://www.blender.org) from scenes built in code here (`tools/views`).
- Photo Mode: [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer) (MIT), [oidn-web](https://github.com/pissang/oidn-web) (MIT) with
  [Open Image Denoise](https://github.com/RenderKit/oidn) weights (Apache 2.0, `public/oidn/LICENSE.txt`).
- Icons: [Lucide](https://lucide.dev) (ISC). Font: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (SIL OFL).
- `docs/reference/` holds the developer's sales and CAD sheets, kept as reference for this private prototype.
- All furniture products and brands are invented. Their prices are placed in bands taken from Malaysian retail listings; see `docs/pricing.md`.
