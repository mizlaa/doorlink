# Doorlink demo → production integration handover

Audience: the Claude Code session working on the real Doorlink app. Read all of this before changing anything.

## 0. Where everything is

| | |
|---|---|
| Repository | `mizlaa/doorlink` (one repo for both the real app and the demo) |
| Real app | Next.js 15 / React 19 app in `src/`, `prisma/`, `public/` on **`main`** |
| Demo | Vite SPA in **`demo-app/`** on branch **`doorlink-demo`** (head `33469df` when this was written; the latest commit adds only this handover, its tests and scripts) |
| Shareable build | `demo-app/doorlink-demo.html`: one self-contained file, the same build as the published preview |

`main` has not moved since the demo branch was cut: `doorlink-demo` is 18 commits ahead, 0 behind.

### ⚠️ Do NOT merge `doorlink-demo` into `main`

As well as the 3D work, the branch contains changes that are **not** part of the 3D experience:

| Commit | What it is | Action |
|---|---|---|
| `119fa2f` "Add demo mode…" | A separate *demo mode* for the real app. It touches `src/lib/payments/*`, `src/lib/prisma.ts`, `src/lib/storage.ts`, the Stripe webhooks, sign-in/register, admin and `.env.example`; adds `src/lib/demo/*`, `src/app/demo/`, `src/app/admin/demo/`, `prisma/seed-demo.ts` and `public/demo/*`; and adds the `demo:*` package scripts. Everything is guarded by `isDemo()`. | **Leave out.** It's a separate feature; adopt it only as a deliberate decision of its own. |
| `5e2c47d` "Add files via upload" | `DOORLINK_SCREEN_GUIDE.txt`, `DOORLINK_SCREENS_41_TO_47.zip` | Leave out (reference material). |
| `98ae6e9` (`tsconfig.json`) | Adds `"demo-app"` to the root `exclude`. | Optional. Needed only if `demo-app/` ends up on `main`. |

**Port by copying files**, as described in section 4, onto a new branch cut from `main`. Never cherry-pick whole commits.

## 1. How the demo is built (and why it isn't drop-in)

`demo-app/` is a Vite app that imports the real app's components straight from `../src` (alias `@/` → `src/`). The plugin `doorlink-demo-redirects` in `demo-app/vite.config.mts` swaps some real modules at build time:

| Real module | Demo replacement | Notes |
|---|---|---|
| `src/components/three/ConfiguratorScene.tsx` | `demo-app/src/three/ConfiguratorScene.tsx` | **Same export and props** (`preview`, `isOpen`, `onToggle`), so it's a drop-in. |
| `src/lib/configurator/look.ts` | `demo-app/src/three/look.ts` | **Same exports** (`doorSizeScales`, `lookFromSpec`, `gateLookFromSpec`, `Preview`, `previewFromSpec`); it maps the real `DoorSpec` onto the new scene's look types. |
| `src/components/quotes/Stars.tsx` | `demo-app/src/components/Stars.tsx` | Half-star rendering. Optional. |
| server actions (`app/**/actions.ts`, `lib/auth-session.ts`) | `demo-app/src/actions/*` | **Demo only**: localStorage fakes. Never port. |

The homepage hero in the demo is `demo-app/src/xray/GarageDoorHero.tsx`, a copy of `src/components/garage-door/GarageDoorHero.tsx` with the portal, intro captions, X-ray link and Doorlink World added.

Everything else in `demo-app/src/pages`, `demo/`, `layout/`, `actions/`, `stubs/`, `router.tsx`, `App.tsx` and `shim.ts` is **demo scaffolding**: the SPA shell, the fake data store, hash routing and the demo banner. **None of it is needed in production.**

## 2. Inventory of the 3D experience

Line counts are approximate. Target paths are suggestions; the real app's conventions win.

### 2a. Shared 3D engine: `demo-app/src/three/` (reusable, core)
| File | Purpose | Port |
|---|---|---|
| `Stage.tsx` (226) | Canvas, lighting, sky or night, HDRI, effects composer (N8AO, SMAA, DoF, AgX), PerformanceMonitor, camera rig. Options: `night`, `blockers`, `fov`, `onDemandShadows`, `focusFollow`, `haze`, `fitAspect`, `studio`. | Yes |
| `CameraRig.tsx` (245) | OrbitControls with polar and distance limits, ground guard, building collision (`blockers`), animated view flights with durations, `CameraBus` (view, zoom, spin), `fitAspect` framing. | Yes |
| `quality.ts` (50) | Quality tiers, `detectTier()` (touch devices start on `low`), reduced-motion check. | Yes |
| `merge.tsx` (81) | `MergeStatic`: bakes static subtrees into one mesh per material (1,574 → 281 draw calls). | Yes |
| `shadows.tsx` (28) | Shadow map redrawn only while something moves (`wakeShadows`). | Yes |
| `assets.ts` (152) | Loads the textures and the CC0 HDRI; `preloadSceneAssets()`. **Needs adapting** (see 4.2). | Yes, adapt |
| `materials.ts` (150) | House and landscape materials; lawn colour variation (`onBeforeCompile`). | Yes |
| `geometry.ts` (187) | World-UV boxes, walls with openings, hip roofs, seeded RNG. | Yes |
| `House.tsx` (406), `Interior.tsx` (85), `Landscape.tsx` (216), `Plants.tsx` (200), `wind.ts` (43) | House, garage interior, yard, street, neighbours, instanced foliage with wind. | Yes |
| `Doors.tsx` (924) | Sectional, roller and tilt doors with real mechanics (tracks, springs, opener); X-ray highlight hooks. | Yes |
| `GateScene.tsx` (1081) | Sliding, swing and pedestrian gates, fence runs, pillars, window and shop shutters, and the gate scene. Uses the real `@/components/three/SceneMaterials`. | Yes |
| `GarageScene.tsx` (136) | Garage configurator scene and `DoorLook` types. | Yes |
| `ConfiguratorScene.tsx` (250), `look.ts` (110) | Drop-in replacements (see section 1); adds view, zoom and 360° controls, full screen, adaptive quality and an off-screen pause. | Yes |
| `textures/` (1.6 MB) | 21 WebP colour/normal maps and `park_512.hdr` (CC0 Poly Haven "Rooitou Park", reduced). Generated by `demo-app/scripts/make-textures.py`. | Yes, move to `public/` |

### 2b. Doorlink World: `demo-app/src/world/`
| File | Purpose | Port |
|---|---|---|
| `WorldScene.tsx` (825) | The whole property: house, garage door, sliding gate, pedestrian gate, fence, shutters, suburb, night lights, hotspots, x-ray outlines, views, portrait framing, building blockers, shader warm-up, memoised products. | Yes |
| `DoorlinkWorld.tsx` (634) | Full-screen overlay: the transformation sequence, product cards, fence styles, day/night, the **intro controller** (scenes, Next/Previous, pause, countdown, skip, replay), narration and exit. | Yes; wire the CTAs (section 5) |
| `Intro.tsx` (160) | Intro script, the caption bubble, the market, features and logo overlays, and the seen flag (`localStorage`). **Imports demo `COMPANIES`** (section 5). | Yes, adapt |
| `Portal.tsx` (280), `portalGL.ts` (172) | Homepage portal: a WebGL swirl in the opening garage (CSS fallback), the full-screen journey and the dissolve into the world. | Yes |
| `voice.ts` (73) | Narration: plays `public/audio/*.mp3` through one `<audio>` element, unlocked by the Enter tap, with a remembered mute. | Yes |
| `world.css` (252) | Every style for the world, portal, intro and tour controls (Doorlink palette). Plain global CSS. | Yes |

### 2c. X-Ray Garage: `demo-app/src/xray/`
| File | Purpose | Port |
|---|---|---|
| `XRayGarage.tsx` (341), `XRayScene.tsx` (354), `xray.css` (116) | Educational X-ray of a sectional door: stations, obstruction test, thermal view, opener comparison. | Yes |
| `GarageDoorHero.tsx` (192) | The real hero plus the portal, the invite, scene-1 captions and lazy world/X-ray. | Merge into the real hero (section 4.4) |

### 2d. Public assets (`demo-app/public/`)
| Path | Size | Notes |
|---|---|---|
| `images/world/glimpse-wide.webp`, `glimpse-tall.webp` | 136 KB | Portal glimpses captured from the live scene (`?snapshot=1`). Recapture if the arrival view changes. |
| `audio/*.mp3` (9 clips) | 192 KB | Narration generated once with Kokoro-82M (Apache-2.0), voice `bf_emma`, by `demo-app/scripts/gen-voice.py`. The text must match the captions in `DoorlinkWorld.tsx`. |
| `images/simulator/*` | — | Already in the real app's `public/images/simulator`. |

## 3. Dependencies

**No new packages.** Everything is already in the root `package.json`, at the same versions the demo was built and tested with:
`three ^0.186.0`, `@react-three/fiber ^9.7.0`, `@react-three/drei ^10.7.8`, `@react-three/postprocessing ^3.1.1`, `postprocessing ^6.39.5`, `@types/three ^0.186.0`, React 19, Next 15.
It also uses `three/examples/jsm/utils/BufferGeometryUtils.js` (from three) and the browser's WebGL, `<audio>` and `localStorage`.

Tooling only (not runtime): `scripts/make-textures.py` (Python and Pillow) and `scripts/gen-voice.py` (a venv with `kokoro-onnx`, `soundfile`, ffmpeg and the model files from the `thewh1teagle/kokoro-onnx` GitHub release).

## 4. Integration plan (safe, incremental, behind a flag)

### 4.0 Ground rules
- Work on a new branch cut from `main`, e.g. `feature/3d-experience`. **Don't merge `doorlink-demo`.**
- Put everything behind a flag, e.g. `NEXT_PUBLIC_FEATURE_3D_V2=1`. With the flag off, the current app renders exactly as it does today.
- Don't delete the existing `src/components/three/*` or `src/components/garage-door/*` until the new versions have shipped and been verified.
- All 3D components are client-only: `'use client'`, mounted through `next/dynamic(..., { ssr: false })`. They use `window`, `document`, WebGL and `localStorage`.

### 4.1 Copy the engine
Copy `demo-app/src/three/*` (except `ConfiguratorScene.tsx` and `look.ts`) to a new folder such as `src/components/three-v2/`. Add `'use client'` to every `.tsx`. Imports between these files are relative, so they keep working. Keep `@/components/three/SceneMaterials` (it already exists in the real app).

### 4.2 Move the textures to `public/`
`assets.ts` imports textures as Vite modules (`import url from './textures/x.webp'`, `?url` for the `.hdr`). In Next:
- move `demo-app/src/three/textures/*` → `public/textures/scene/*`;
- in `assets.ts`, replace each import with a string path (`'/textures/scene/brick_color.webp'`), including the HDR (`'/textures/scene/park_512.hdr'`).

Keep the loader logic (anisotropy, colour space, the manual HDR decode) as it is.

### 4.3 Configurator (lowest risk, biggest visual win)
Behind the flag, have `src/app/configure/Configurator.tsx` load the new `ConfiguratorScene` (copied to `src/components/three-v2/ConfiguratorScene.tsx`) and the new `look.ts` (to `src/lib/configurator/look-v2.ts`), using the same dynamic import it uses now. The props are identical. This also brings the full-screen mode and the aspect-fit framing.

### 4.4 Homepage portal, Doorlink World and X-ray
1. Copy `demo-app/src/world/*` → `src/components/doorlink-world/*` and `demo-app/src/xray/{XRayGarage,XRayScene}.tsx` and `xray.css` → `src/components/xray/*`. Fix the imports from `../three/...` to the new engine folder.
2. CSS: import `world.css` and `xray.css` from the client components that use them (Next supports global CSS imports from client components) or from `src/app/globals.css`. Class names are all prefixed (`world-`, `portal-`, `intro-`, `tour-`, `xray-`), so they won't clash.
3. Copy `public/images/world/*` and `public/audio/*` into the real `public/`.
4. Hero: **don't replace** `src/components/garage-door/GarageDoorHero.tsx`. Behind the flag, apply the differences from `demo-app/src/xray/GarageDoorHero.tsx`:
   - render `PortalGarageScene` (from `Portal.tsx`) in place of `GarageDoorScene`. It's the same markup, with the portal mounted behind the panels;
   - the portal invite (`YOUR WORLD. YOUR DESIGN.` / Enter), the scene-1 captions, the prefetch of the world chunk, `PortalTravel`, and lazy `DoorlinkWorld` / `XRayGarage` through `next/dynamic` with `ssr: false`;
   - call `unlockVoice()` from the Enter tap.
5. `DoorlinkWorld`'s `z-index` (190) and the portal's (195–198) sit above the app header (z ≤ 100). Check the real layout's own stacking.

### 4.5 Strip or keep the debug hooks
`Stage.tsx` and `DoorlinkWorld.tsx` expose `window.__doorlinkGL`, `__doorlinkCam` and `__doorlinkWorld` **only when the URL contains `?perf`**, and `DoorlinkWorld` has a `?snapshot` mode (used to recapture the glimpses). Keep them for QA, or remove them before release.

## 5. Connecting to real Doorlink features

| Demo element | Demo behaviour | Connect to |
|---|---|---|
| Configurator 3D preview | Uses the real `DoorSpec` from the real configurator | Already real: only the renderer changes. |
| World product cards (garage, sliding gate, pedestrian gate, shutters, fence) | Static descriptive text; Open/Close and X-ray | Add a **"Design this"** CTA → `/configure?product=garage_door \| sliding_gate \| swing_gate \| pedestrian_gate \| fence \| shutter` (use the configurator's real product keys), carrying the chosen look (e.g. the fence style) as query parameters the configurator already understands, or extend it. |
| Fence styles (charcoal, timber-look, pickets, solid) | Four hard-coded `FENCE_STYLES` in `WorldScene.tsx` | Map to real catalogue finishes and colours, or keep them as illustrative presets. |
| Door, gate and shutter looks in the world | Fixed `OLD_DOOR` / `NEW_DOOR` and colours | Optional: drive them from catalogue items. |
| Intro scene 6 "Quotes for your project" | **Demo `COMPANIES`** sorted by rating (`Intro.tsx` imports `../demo/data`) | Replace with real top-rated businesses: fetch on the server (page/server component or an API route) and pass them as props. Show only fields the real model has (name, rating, review count, suburb, response time). If there's no data, hide the panel rather than faking it. |
| Intro scene 7 features (Design / Visualise / Compare / Connect) | Static tiles | Optionally make them links: `/configure`, Doorlink World, `/compare` or quotes, `/request-technician` and `/marketplace`. |
| Logo reveal "Explore the property" | Ends the intro | Optionally add "Get free quotes" → the real quote flow. |
| Hero "Hire a pro" / "Design yours" | Real links | Unchanged. |
| Intro seen flag | `localStorage['doorlink:intro-seen-v1']` | Fine for production. Optionally store it per user. |
| Narration | 9 static MP3 clips | Static by design. If you change the wording, regenerate with `scripts/gen-voice.py` and keep the caption text in sync (`voice.ts` matches clips by each line's opening words). |
| "Established in 2026…" copy | Your wording | Confirm before release. |

### Demo-only (never port)
`demo-app/src/actions/*`, `demo/*` (the data store and seeds), `pages/*`, `layout/*` (the demo banner and shell), `stubs/*`, `router.tsx`, `App.tsx`, `shim.ts`, `scripts/single-file.mjs`, `doorlink-demo.html`, and the separate demo-mode feature (`src/lib/demo/*` etc., commit `119fa2f`).

## 6. Performance work already in place (keep it)
- **Static batching:** `MergeStatic` bakes static meshes per material. Instanced foliage and the instanced distant suburb.
- **Shadows on demand:** the shadow map is redrawn only while objects move.
- **Stable effects:** the effects composer stays mounted on every tier (unmounting it recompiled every shader, which was the cause of the mid-tour freezes) and is memoised, so state changes don't rebuild it. The shadow map resizes in place.
- **Quality tiers:** they only step down (no bouncing). Touch devices start on `low` (no AO, DoF or foliage shadows; DPR ≤ 1.5).
- **Shader warm-up:** non-blocking `compileAsync` once the world mounts (under the portal).
- **Memoised products:** they re-render only when their own state changes. The intro controller cancels each scene's timers and pauses in background tabs.
- **Portal:** pure CSS on the homepage with a small WebGL canvas (DPR ≤ 1.5); no 3D engine until Enter. The world chunk is prefetched while the door opens, and the world mounts only once the portal fills the screen.
- **Lazy loading:** World and X-ray are separate lazy chunks. Textures are WebP; the HDRI is 512 × 256.

Suggested extras in production: serve `/textures`, `/audio` and `/images/world` with long-lived cache headers. Consider KTX2/Basis textures later (that needs a transcoder; not done in the demo).

## 7. Verification
`demo-app/tests/browser/*.cjs` are Playwright scripts used to verify the demo:

| Script | Covers |
|---|---|
| `tour.cjs` | Intro controller: rapid Next, Previous mid-transition, fence ↔ shutters with no new shader programs, pause, countdown, resize, Finish, replay and skip. |
| `intro.cjs` | Every caption and overlay; the seen flag. |
| `portal.cjs` | The portal journey and re-entry. |
| `world.cjs` | The transformation, product cards, X-ray, night, camera bounds. |
| `xray.cjs` | The X-Ray Garage. |
| `designer.cjs` | Configurator full screen. |
| `audioprobe.cjs` | Narration clips play under a tap-required autoplay policy. |

They target `http://localhost:4300/` (`XURL` overrides it) and save screenshots to `$SHOTS`. They use hash routes (`#/`, `#/configure`), so adapt the URLs and selectors to the Next routes when you port them. Run them headed or on a real GPU for meaningful timings; software rendering is slow.

Also run the real app's own checks: `npm run typecheck`, `npm test`, `next build`, plus the real e2e and journeys. The demo was checked with the demo e2e suites (`demo-app/tests/e2e-*.cjs`), which don't cover the real backend.

## 8. Risks and checks before release
- **WebGL availability:** keep the existing fallbacks (`GarageDoorFallback`, `GatePreviewFallback`, `supportsThreeWebGL`). The portal falls back to CSS automatically.
- **CSP:** the portal and world use `data:` URLs only in the single-file build. In Next everything is served from `/public`, so no CSP change is expected. Media autoplay needs no special policy (it plays on the Enter tap).
- **SSR:** never import the 3D modules from server components. Always go through `dynamic(..., { ssr: false })`.
- **Bundle:** the engine is about 7k lines. Keep World and X-ray lazy so the homepage stays light.
- **Real devices:** the demo was tested in a software renderer. Profile on a mid-range Android, an iPhone and a laptop before rollout (the Chrome performance panel; `?perf` exposes `__doorlinkGL.info`).
- **Content:** confirm the copy, the "Established in 2026" claim and the fictional business names are replaced by real data where it's shown.

## 9. Prompt to hand to the main Doorlink chat
> Read `demo-app/INTEGRATION-HANDOVER.md` on branch `doorlink-demo` of `mizlaa/doorlink`. Create `feature/3d-experience` from `main` (do not merge `doorlink-demo`). Port the 3D engine, Doorlink World, portal, intro and X-ray exactly as section 4 describes, behind `NEXT_PUBLIC_FEATURE_3D_V2`. Keep every existing feature working with the flag off. Do steps 4.1–4.3 first and verify the configurator before 4.4. Wire the real data per section 5 and never ship demo data. Run the real app's typecheck, tests and build after each step. Do not deploy or merge without my approval.
