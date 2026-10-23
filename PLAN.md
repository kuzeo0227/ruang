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
| Floor level | Set per view: rainforest L5, mountain L12, beach L10, KL skyline L38 |
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
- Realism: AgX tone mapping, N8AO ambient occlusion, soft shadows, SMAA, bevelled geometry, scanned
  PBR textures, and dynamic resolution. Photo Mode uses three-gpu-pathtracer when standing still.
- three-mesh-bvh for collision and hover hits. Zustand for state and undo. lz-string to encode layouts in share links.
- A custom touch joystick, shown whenever the screen is touched, including on the laptop's touchscreen.
- Sun position computed for Kuala Lumpur (3.14°N, 101.69°E) from the time of day and month.
- Quality presets, targeting 60 fps on the Arc 130V at roughly 1080p internal resolution.

## Phases

0. **Design sign-off** (done, awaiting approval): plan data and checks, catalogue and pricing, mood boards, interface mockup.
1. **Walkable Type A**:
   - The shell built from `src/plan`: walls, openings, doors, window frames and glass, skirting, ceiling.
   - Floor and wall finishes from one style pack.
   - First-person controls with collision and a touch joystick.
   - Physical sky and sun, plus one window view (mountain).
   - **Checkpoint:** you walk it on your laptop and judge scale and realism.
2. **Furniture**:
   - Parametric generators and the scanned models.
   - Default layouts per style.
   - Hover prices.
   - Pick up / rotate / hide / swap / finish in walk mode.
   - Plan mode.
   - Undo, and the running total.
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
