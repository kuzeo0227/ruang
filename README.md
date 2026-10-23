# Ruang

A first-person interior design walkthrough of three condo floor plans (Types A, B1 and B).
Walk through a unit, switch between five interior styles, move and swap furniture with
prices in MYR, and change the time of day and the view outside. Experimental; runs as a
local web page on your own computer.

## Status

**Phase 0 (design sign-off) is complete.** There is no 3D yet. These are the pieces to
review before Phase 1 starts:

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

**Phase 0:** there is no server yet. In File Explorer, double-click the `index.html` files in the
table above; they open in Chrome or Edge.

**From Phase 1:** run `npm run dev` and open <http://localhost:5173>. To try it on your phone, connect
the phone to the same Wi-Fi, run `npm run dev -- --host`, and open the "Network" address it prints.
If Windows asks whether Node.js may use the network, allow it on **Private networks**.

For the smoothest 3D: use Chrome or Edge, keep the laptop plugged in, and set Windows power mode to
**Best performance** (Settings → System → Power & battery).

## Scripts

| Command | What it does |
|---|---|
| `npm run check:plans` | Checks the rebuilt floor plans against the CAD area and daylighting tables |
| `npm run render:plans` | Regenerates the SVG plans and `docs/plans/index.html` |
| `npm run export:catalogue` | Validates the catalogue and writes `docs/catalogue.csv` and `docs/pricing.md` |
| `npm run build:moodboards` | Regenerates `design/moodboards/index.html` |
| `npm run build:mockup` | Regenerates `design/ui-mockup/index.html` |
| `npm run typecheck` | TypeScript check |

## Layout

```
src/plan/          floor-plan data model; one generator builds Types A, B and B1
src/catalogue/     materials, style packs, price bands and catalogue items
src/ui/tokens.css  design tokens shared by the app and the mockup
scripts/           checks and generators for everything in docs/ and design/
design/            mood boards and interface mockup
docs/              rebuilt plans, pricing, catalogue CSV, previews, reference sheets
```

## Credits

- Textures, 3D models and panoramas: [Poly Haven](https://polyhaven.com) and [ambientCG](https://ambientcg.com), both CC0.
- Icons: [Lucide](https://lucide.dev) (ISC). Font: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (SIL OFL).
- `docs/reference/` holds the developer's sales and CAD sheets, kept as reference for this private prototype.
- All furniture products and brands are invented. Their prices are placed in bands taken from Malaysian retail listings; see `docs/pricing.md`.
