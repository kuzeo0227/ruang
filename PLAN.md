# Ruang plan

## Goal

An experimental tool for a potential business: walk through a condo unit in first person at true
scale, restyle it, and see what the furniture would cost. It runs as a local web page on a laptop,
and on a phone over the same Wi-Fi. It is not a buyer-facing product.

## Decisions (agreed 23 Oct 2026)

| Topic | Decision |
|---|---|
| Laptop | Lenovo Yoga Slim 7 14ILL11: Core Ultra 5 226V, Intel Arc 130V, 16 GB shared memory, touchscreen |
| Unit order | Type A, then B1, then B |
| Ceiling | 2.75 m clear |
| Orientation | Balcony side (top of the sheets) faces north, so the B1 bay window faces east |
| Floor level | Set per view: rainforest L5, mountain at ground level (a highland valley; every CC0 mountain panorama is shot from the ground), beach L10, KL skyline L38 |
| Styles | Five: Muji-inspired Natural, Japanese, Brutalist, Minimalist, Quiet Luxury |
| Prices | One dummy MYR price per item, estimated from online product prices; no renovation costs |
| Editing | Everything movable, including kitchen modules, wardrobes and bathroom fittings |
| Rainforest and KL skyline views | Rendered in Blender inside this environment from online references (Higgsfield has no credits) |
| Delivery | Code in `kuzeo0227/ruang`; run locally with `npm run dev` |
| Interface | Frosted glass over the 3D view; one colour per tool: Style violet, Furniture coral, Lighting amber, Views sky blue, Prices green, Share magenta; coral-magenta-violet gradient for primary actions; Plus Jakarta Sans; Lucide icons |
| Name | Ruang |

## Assumptions about the building (edit `src/plan` if any are wrong)

- Grid lines are wall centrelines. Every room area in the CAD schedule equals its grid rectangle.
- Exterior walls 150 mm, interior walls 125 mm (the two thicknesses marked on the sheets).
- Window sizes reproduce the daylighting table: Bedroom 1 2700 × 1200, Bedroom 2 1800 × 1200, study
  800 × 1800, toilets 600 × 600, balcony slider 2630 × 2400, B1 bay window 1350 wide projecting 526 mm.
  Sill heights are assumed (bedrooms 900, study 300, toilets 1500, bay 500).
- Doors: main 1000, bedrooms 850, study 800, toilets 700, yard 800; all 2100 high. Positions and
  swings follow the CAD.
- The foyer is a recess outside the main door, open to the common corridor.
- Toilets, yard, balcony and AC ledges step down 30 mm. No ceiling bulkheads yet.

## Phase 0 findings

- All three types match the CAD room areas (to rounding), the unit totals, and the daylighting
  glass areas (`npm run check:plans`).
- Only about 15 of Poly Haven's 521 free models suit these styles (most are antique or industrial). The
  catalogue uses 17 scanned models and builds the other 131 pieces in code, which also makes
  finish swaps straightforward.
- Price levels come out as follows (3-seat sofa / queen bed): Minimalist RM2,799 / RM1,749,
  Muji RM3,799 / RM2,499, Japanese RM5,249 / RM3,549, Brutalist RM6,949 / RM4,749,
  Quiet Luxury RM13,999 / RM9,899.
- Two textures were replaced after visual review. Poly Haven's "wool_boucle" is actually a check
  pattern; ambientCG Fabric045 is used instead. Hinoki planks were rustic; a clean pale oak veneer is used instead.
- Poly Haven file names vary per asset, so assets are always resolved through its API.
- This environment has no GPU. Screenshots from here can verify layout, scale and materials, not frame rate.

## Architecture (from Phase 1)

- Vite, React and TypeScript, with three.js through React Three Fiber and drei. The baseline is WebGL2.
  Zustand holds app state; per-frame scene state lives outside React (`src/render/registry.ts`).
- The shell (walls, openings, joinery, floors, ceilings) is generated from `src/plan` by `src/shell/build.ts`
  and checked by `npm run check:shell`. Collision is circle-against-boxes in plan space.
- Light, in physically plausible ratios (sun ≈ 100,000 lux, sky about a quarter of that on a horizontal
  surface, downlights about 150-300 lux):
  - Sun: position computed for Kuala Lumpur (3.14°N, 101.69°E) from the time and month; shadow map.
  - Sky: Preetham model with clouds, a twilight afterglow, and stars at night. The window view is a
    panorama band composited under the sky and re-lit for the time of day.
  - Daylight through each window, sliding door and glass partition is an area light whose brightness is
    whatever a small camera sees outside it. Surfaces integrate the opening's shape, and each opening's
    soft shadow map (variance shadow map) stops light going through walls.
  - Bounce light from a probe per room, captured with the openings covered and rebuilt from scratch in two
    passes after every change; reflections from a second, box-projected probe.
  - Downlights are evaluated per room in the surface shaders, so they never light the next room
    through a wall, and switching them never recompiles shaders.
- Camera: auto exposure that adapts like an eye, white balance (neutral by day, warm-white under
  downlights), AgX tone mapping, N8AO ambient occlusion and bloom (medium and high quality), SMAA, vignette.
- Quality presets cap the internal resolution (about 1080p on medium) for the Arc 130V.

## Architecture (added in Phase 2)

- Furniture: 131 pieces are built in code (`src/furniture/gen`), per style, at their catalogue size with
  UVs in metres so wood grain and weave come out at real scale; 17 are Poly Haven scans, turned and
  scaled to their catalogue size (`src/render/models.ts`). `npm run check:furniture` builds every piece
  in every style and finish.
- Each piece is lit by its room with the shell's own shader: window light, bounce, reflections,
  downlights. Lamps (floor, table, pendant, desk, fan lights) are point lights in the same shaders,
  up to four per room, and their shades glow when the lights are on.
- Window light is shadowed twice: by the building (sharp, so no light leaks between rooms) and by the
  furniture (blurrier where the gap to the surface is wider, and never the whole opening).
- Starting layouts (`src/furniture/layouts`) are written against each room's wall faces, door swings
  and openings, so the same recipe fits Types A, B and B1. `npm run check:layouts` checks them.
- Editing state is a list of placements per unit and style (`src/state/layout.ts`), saved in the
  browser; every edit is one undo step. Hit tests use three-mesh-bvh.
- Plan mode is the same scene from an orthographic camera with the ceilings hidden; shadows and probes
  wait until walking resumes.
- Night white balance follows the colour of the light actually in view (like a camera), within the
  lamps' colour, so mixed lamp and window light stays warm-white.
- Planned for later phases: lz-string for share links, three-gpu-pathtracer for Photo Mode.

## Phases

0. **Design sign-off** (done, approved): plan data and checks, catalogue and pricing, mood boards, interface mockup.
1. **Walkable Type A** (done, awaiting your walk-through):
   - The shell built from `src/plan`: walls, openings, doors, window frames and glass, skirting, ceiling.
   - Floor and wall finishes from one style pack.
   - First-person controls with collision and a touch joystick.
   - Physical sky and sun, plus one window view (mountain).
   - **Checkpoint:** you walk it on your laptop and judge scale and realism.
   - Also built in Phase 1, ahead of plan: all five style shells, the time-of-day and month controls,
     Auto/On/Off room lights, a tape measure, doors that open and close, quality presets and diagnostics.
   - Known gaps: frame rate is untested on real hardware (this environment has no GPU); the B1 bay window
     does not yet let in daylight (Phase 4); window shadows are deliberately soft approximations.
2. **Furniture** (done, awaiting your walk-through):
   - Parametric generators and the scanned models.
   - Default layouts per style (68 to 70 pieces each in Type A; Minimalist RM63,707 to Quiet Luxury RM188,715).
   - Hover prices.
   - Pick up / rotate / hide / swap / finish in walk mode.
   - Plan mode.
   - Undo, and the running total.
   - Also built: the catalogue with 3D thumbnails, search and swap-with-price-difference; the bill by
     room; lamp light at night; touch selection and action sheet; kitchen base and shower screen widths.
   - Known gaps: the B1 bay window still lets in no daylight; furniture can overlap if you put it
     there (nothing stops it); frame rate with furniture is untested on the Arc 130V.
3. **Light and views**:
   - Time-of-day and month sliders.
   - Per-room switches, dimmers and colour temperature.
   - All four views, with the rainforest and KL skyline rendered in Blender.
   - Photo Mode.
4. **Complete**:
   - All five styles.
   - Types B1 and B.
   - Saved layouts and share links.
   - Phone polish and quality presets.
