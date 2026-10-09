# Trace on Map Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a HACS-installable Lovelace card `custom:trace-on-map-card` that embeds HA `<ha-map>`, loads up to 720h location history, and supports timeline play/scrub plus native map options.

**Architecture:** Single ES module card; no map tile deps. Pure modules for history/playback/utils; card hosts `<ha-map>` and timeline UI. Playback updates `paths` (clipped) and toggles live entity markers vs path endpoints.

**Tech Stack:** TypeScript, Rollup, Vitest, Home Assistant frontend `ha-map` (runtime only).

## Global Constraints

- Map: only `<ha-map>`; no Leaflet/MapLibre/tile vendor code or strings
- `hours_to_show`: default 24, clamp `[1, 720]`, editor enforces same
- Card type: `custom:trace-on-map-card`; output `trace-on-map-card.js`
- Delivery: HACS (`hacs.json`) + manual `/local/` README
- Config parity: historymapcard features + `auto_fit`, `fit_zones`, `aspect_ratio`, `theme_mode`, `cluster`, zones via entities
- All code under `/Users/farquer/github/trace-on-map-card`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/types.ts` | Config, hass, history, path types |
| `src/utils.ts` | clampHours, colors, format, normalize entities |
| `src/history.ts` | normalizeHistories, extractTimelinePoints, pointsToHaPaths, clipPathsToTime |
| `src/playback.ts` | PlaybackController class |
| `src/map-host.ts` | create/update ha-map element helpers |
| `src/editor.ts` | Visual config editor |
| `src/trace-on-map-card.ts` | Card element + registration |
| `src/test/*.test.ts` | Unit tests |
| `package.json`, `rollup.config.js`, `tsconfig.json`, `vitest.config.ts` | Tooling |
| `hacs.json`, `README.md`, `LICENSE` | Distribution |

---

### Task 1: Scaffold + pure utils/history/playback

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `rollup.config.js`, `.gitignore`
- Create: `src/types.ts`, `src/utils.ts`, `src/history.ts`, `src/playback.ts`
- Test: `src/test/utils.test.ts`, `src/test/history.test.ts`, `src/test/playback.test.ts`

**Interfaces:**
- Produces: `clampHours(n): number`, `normalizeEntityConfigs`, `extractTimelinePoints`, `buildHaPaths`, `clipTimelineToIndex`, `PlaybackController`

- [ ] **Step 1:** Add package.json (name `trace-on-map-card`, scripts build/test/lint, deps like historymapcard minus leaflet)
- [ ] **Step 2:** Write failing tests for clampHours (default/missing → 24; 0→1; 1000→720; 48→48)
- [ ] **Step 3:** Implement `utils.ts` / `types.ts` until tests pass
- [ ] **Step 4:** Write failing tests for extractTimelinePoints + clip + path build
- [ ] **Step 5:** Implement `history.ts` until tests pass
- [ ] **Step 6:** Write failing tests for PlaybackController (play advances, pause, scrub, end stops)
- [ ] **Step 7:** Implement `playback.ts` until tests pass
- [ ] **Step 8:** Commit `AI: #000000 添加纯逻辑模块与单测`

---

### Task 2: Card shell + ha-map host + timeline UI

**Files:**
- Create: `src/map-host.ts`, `src/trace-on-map-card.ts`
- Modify: `rollup.config.js` input → `src/trace-on-map-card.ts`, output `trace-on-map-card.js`

**Interfaces:**
- Consumes: history + playback APIs from Task 1
- Produces: `customElements` `trace-on-map-card`; `window.customCards` entry
- `createHaMap(): HTMLElement`; `applyMapProps(el, props)` sets entities/paths/autoFit/fitZones/clusterMarkers/themeMode/zoom and `hass` if present

- [ ] **Step 1:** Implement `map-host.ts` (feature-detect `customElements.get('ha-map')`)
- [ ] **Step 2:** Implement card: setConfig validation, shadow DOM layout (title, map container, timeline, legend), hass setter triggers fetch
- [ ] **Step 3:** Wire History API fetch (`significant_changes_only=0`), feed paths to ha-map
- [ ] **Step 4:** Wire PlaybackController → update clipped paths; when index < end, pass zone-only entities so path endpoints act as scrub cursor; at end restore all entities
- [ ] **Step 5:** `npm run build` produces `trace-on-map-card.js`
- [ ] **Step 6:** Commit `AI: #000000 实现卡片与 ha-map 时间轴`

---

### Task 3: Editor + HACS + README

**Files:**
- Create: `src/editor.ts`, `hacs.json`, `README.md`, `LICENSE`
- Modify: `src/trace-on-map-card.ts` (`getConfigElement`, `getStubConfig`)

- [ ] **Step 1:** Editor fields: entities list, hours (1–720), zoom, auto_fit, fit_zones, aspect_ratio, theme_mode, cluster, title
- [ ] **Step 2:** hacs.json + README (install, YAML example, “map follows HA default map”, recorder caveat)
- [ ] **Step 3:** Build + test green
- [ ] **Step 4:** Commit `AI: #000000 添加配置器与 HACS 说明`

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| ha-map only / no vendor tiles | 2 |
| history + timeline play/scrub | 1–2 |
| hours default 24 / max 720 / editor clamp | 1, 3 |
| zones/auto_fit/fit_zones/aspect_ratio/theme_mode/cluster | 2–3 |
| HACS + manual | 3 |
| Unit tests for pure logic | 1 |
