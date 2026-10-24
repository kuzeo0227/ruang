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
- Planned for later phases: lz-string for share links.

## Architecture (added in Phase 3)

- Room lights (`src/render/roomLights.ts`): each room has a mode (Auto, On, Off), a dimmer and a colour
  temperature; scenes set them all. Every downlight has its own colour uniform, so the rooms of the
  open-plan zone (living, dining, kitchen, corridor) switch and dim separately without recompiling
  shaders. Lamps and their glowing shades follow their own room. Night exposure adapts only partly to
  a dimmed room (key × √level), so dimming shows.
- Wall switch plates are generated with the shell (`src/shell/build.ts`): on the latch side of each
  room's door (inside bedrooms and the study, outside toilets as is usual in Malaysia), a 4-gang plate
  inside the front door for the living areas, and one by the balcony slider. `E` flips the plate under
  the crosshair. `npm run check:shell` checks every door has one, on a wall face, in the right zone.
- Window views (`tools/views`): procedural scenes rendered in Blender 4.2 (Cycles, CPU) as
  equirectangular bands from each view's floor height: a day pass, a night pass (only emission: lit
  windows, street lamps, boats) and for the sea a water mask. `make_band.py` adds distance haze from the
  mist pass and writes the band, the night lights and the mask as WebP. The sky shader re-lights the
  band for the time of day, fades the night lights in from sunset, adds the city's light-pollution
  glow, and draws the sun's glitter on the water (Cox-Munk slope statistics, animated).
  - KL skyline (`city.py`): districts with their own street grids, terraced houses, condo and office
    towers (an OSL facade shader for floors, bays and lit windows), parks, rivers, highways, and the
    landmarks to the north: Merdeka 118, the Petronas Towers, the Exchange 106, KL Tower.
  - Rainforest (`rainforest.py`): a garden clearing with a lap pool in lowland dipterocarp forest.
    Near trees are trunks, buttresses, branches and crowns of leafy branchlets (every leaf is
    geometry, about 2 million branchlets); the edge has bamboo, palms, tree ferns, bananas and
    climbers; a valley opens to the north-north-east over a canopy of lumpy crowns to hazy hills.
  - Beach (`beach.py`, plants from `flora.py`): the block's garden and pool, a sea wall, 30 m of sand
    with leaning coconut palms, parasols, breakers, the sea with boats, a ship and islands, a bay
    lined with resorts curving out to forested headlands, and a town inland.
- Photo Mode (`src/render/photo.ts`, `PhotoMode.tsx`, `denoise.ts`): three-gpu-pathtracer traces the
  shell, furniture and lights from the current camera, with the sky (and window view) rendered as an
  equirectangular image for light and background. Materials are copied with the app's texture scale,
  plank rotation and roughness folded in; downlights become spotlights with the same beam, lamps point
  lights. Intel Open Image Denoise (oidn-web, WebGPU) cleans the image at 16, 64 and 256 samples, using
  albedo and normal guides rendered once at the start. The result goes through the app's exposure,
  white balance, bloom and tone mapping, and Save writes a PNG. Exposure is not left to the eye
  adaptation (noisy early samples would fool it): 8 samples are traced first to measure the light,
  then the room is exposed by the walk view's rule and the view behind the glass is dimmed or
  brightened (a photographer's "window pull") so it looks as it did while walking. The walk view stays
  on screen until the first denoised image is ready.

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
   - Fixed while checking the previews: a hairline crack down every cushion; the main door lit as
     the foyer recess outside it; the shoe cabinet standing at the recess's open edge (now just
     inside the door); pendants at eye level (now 90 cm over the table); swapping lost in
     development mode; the key hints running under the dock at 1440 px; the phone top bar
     overflowing.
   - Known gaps: the B1 bay window still lets in no daylight; furniture can overlap if you put it
     there (nothing stops it); room lights are all on or all off until Phase 3, so bathrooms are dim
     by day; from the balcony end a 1 px line can show across the Brutalist leather sofa, along the
     hidden skirting edge behind it (not ambient occlusion, sun, window light, bounce or
     reflections; cause not found); frame rate with furniture is untested on the Arc 130V.
3. **Light and views** (done, awaiting your walk-through):
   - Time-of-day and month sliders.
   - Per-room switches, dimmers and colour temperature, scenes, and wall switch plates.
   - All four views: the KL skyline, rainforest and beach rendered in Blender, each with a night
     pass; the sun's glitter on the sea.
   - Photo Mode: path-traced, denoised, with the window view held as seen while walking.
   - Also fixed: the landscape stayed lit after sunset (dusk now has a blue hour); the top bar's
     chips overlapped between 480 and 1180 px wide.
   - Known gaps: Photo Mode's speed is untested on the Arc 130V and needs WebGPU for the denoiser;
     the path tracer sees plain textures (no tile joints or per-plank tone); views are flat images
     (no parallax); from Type A the sea glitter shows only on mornings around June.
4. **Complete**:
   - All five styles.
   - Types B1 and B.
   - Saved layouts and share links.
   - Phone polish and quality presets.
