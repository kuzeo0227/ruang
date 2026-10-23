# Ruang

A first-person interior design walkthrough of three condo floor plans (Types A, B1 and B).
Walk through a unit, switch between five interior styles, move and swap furniture with
prices in MYR, and change the time of day and the view outside. Experimental; runs as a
local web page on your own computer.

## Status

**Phase 1 (walkable Type A) is ready for you to walk through.** Type A is built from the plan data
with real doors, windows and finishes, under a simulated Kuala Lumpur sun and sky, with a mountain
view. All five interior styles can be switched (shell finishes only; furniture comes in Phase 2).
The checkpoint for this phase is your judgement of **scale and realism** on your laptop.

Phase 1 screenshots (rendered in software here, so lower quality than on your laptop):

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
| Furniture catalogue (148 items) | `docs/catalogue.csv` (opens in Excel) | [catalogue.csv](docs/catalogue.csv) |
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

Then open <http://localhost:5173> in Chrome or Edge. The first run downloads about 100 MB of CC0
textures and a 3D model from Poly Haven and ambientCG into `public/assets/` (later runs skip this), so
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
| Doors | <kbd>E</kbd> when "Open door" shows under the crosshair | Tap the "Open door" button |
| Tape measure | <kbd>M</kbd> at the start point, <kbd>M</kbd> at the end point | Ruler button |
| Lights | <kbd>L</kbd>, or Lighting → Room lights | Lighting tab |
| Time of day | <kbd>,</kbd> and <kbd>.</kbd> step 15 minutes; Lighting panel for time, month and presets | Lighting tab |
| Panels | <kbd>1</kbd> Style · <kbd>3</kbd> Lighting · <kbd>4</kbd> Views · <kbd>Esc</kbd> closes | Tabs at the bottom |

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
| `npm run render:plans` | Regenerates the SVG plans and `docs/plans/index.html` |
| `npm run export:catalogue` | Validates the catalogue and writes `docs/catalogue.csv` and `docs/pricing.md` |
| `npm run build:moodboards` | Regenerates `design/moodboards/index.html` |
| `npm run build:mockup` | Regenerates `design/ui-mockup/index.html` |
| `npm run typecheck` | TypeScript check |

## Layout

```
src/plan/          floor-plan data model; one generator builds Types A, B and B1
src/shell/         3D shell from the plan: walls, openings, joinery, collision, lighting zones
src/render/        canvas, materials, sun and sky, daylight, probes, post-processing, walking
src/ui/            interface (top bar, dock, panels, minimap, touch controls) and design tokens
src/state/         app state
src/catalogue/     materials, style packs, price bands and catalogue items
scripts/           asset download, checks, and generators for docs/ and design/
tools/             make_backdrop.py: turns a CC0 panorama into a window-view band
public/backdrops/  window views (mountain so far)
design/            mood boards and interface mockup
docs/              rebuilt plans, pricing, catalogue CSV, previews, reference sheets
```

## Credits

- Textures, 3D models and panoramas: [Poly Haven](https://polyhaven.com) and [ambientCG](https://ambientcg.com), both CC0.
  The mountain view is built from Poly Haven's "Drakensberg Solitary Mountain" panorama.
- Icons: [Lucide](https://lucide.dev) (ISC). Font: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (SIL OFL).
- `docs/reference/` holds the developer's sales and CAD sheets, kept as reference for this private prototype.
- All furniture products and brands are invented. Their prices are placed in bands taken from Malaysian retail listings; see `docs/pricing.md`.
