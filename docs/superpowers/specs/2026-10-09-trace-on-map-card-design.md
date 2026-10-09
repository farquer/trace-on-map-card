# Trace on Map Card — Design Spec

**Date:** 2026-10-09  
**Status:** Approved (user waived section-by-section review; approach A)  
**Repo:** `trace-on-map-card`

## 1. Goal

Home Assistant Lovelace custom card that shows entity location history on HA’s **default map**, with timeline playback/scrubbing aligned to `historymapcard`, plus native Map card capabilities (zones, auto_fit, fit_zones, aspect_ratio, theme_mode, cluster).

**Non-goals**

- Any map vendor logic (TianDiTu, CARTO, custom tile URLs, etc.)
- Replacing or patching HA’s global map tile pipeline
- Backend/custom component; frontend card only

## 2. Constraints (decided)

| Item | Decision |
|------|----------|
| Map rendering | Embed HA frontend `<ha-map>` only |
| Tile source | Whatever HA default map uses (native or user-replaced via `extra_module_url`) |
| Feature scope | `historymapcard` parity + native map options 1–6 (zones, auto_fit, fit_zones, aspect_ratio/height, theme_mode, cluster) |
| `hours_to_show` | Default `24`, hard max `720`, UI editor clamps 1–720 |
| Delivery | HACS custom repo + manual `/local/` module |
| Code location | All new code in `trace-on-map-card/` |
| Card type | `custom:trace-on-map-card` |
| Min HA Core | **≥ 2026.9.0**（运行时校验 `hass.config.version`；HACS `homeassistant` 字段） |

## 3. Architecture

```
Lovelace → TraceOnMapCard
              ├─ HistoryService      (history/period API → timeline)
              ├─ PlaybackController  (play/pause/scrub → paths + marker positions)
              ├─ HaMapHost           (<ha-map> property bridge)
              ├─ Timeline UI         (slider, play button, time label, legend)
              └─ TraceOnMapCardEditor (UI config)
```

**Hard rule:** No Leaflet/MapLibre dependency in this package. No tile URL constants. Map visuals come exclusively from the already-loaded `ha-map` custom element in HA’s frontend.

### 3.1 Component responsibilities

| Unit | Does | Depends on |
|------|------|------------|
| `TraceOnMapCard` | Lovelace lifecycle (`setConfig`, `hass`, size), layout shell | `hass` |
| `HistoryService` | Fetch & normalize history with lat/lng; build sorted timeline | `hass.callApi` |
| `PlaybackController` | Index/time mapping; advance frames; clip paths to “now” | Timeline points |
| `HaMapHost` | Create/update `<ha-map>`: entities, paths, zones-related flags, cluster, auto-fit, theme | Browser `ha-map` |
| `TraceOnMapCardEditor` | Visual config; clamp hours | HA form elements where available |

### 3.2 Why `<ha-map>`

- Uses HA’s map style/tile pipeline (`/static/map/*.json`, `/api/map_tiles/...`, MapEngine).
- If the user replaces default map tiles (e.g. TianDiTu via `hass_tianditu.js`), this card inherits that automatically with **zero** vendor-specific code.
- Native features (paths, cluster, zones, fit) already exist on `ha-map` / map card patterns.

## 4. Data flow

### 4.1 History fetch

1. Clamp `hours_to_show` to `[1, 720]` (default 24).
2. `GET history/period/{startISO}?filter_entity_id={ids}&significant_changes_only=0`
3. Do **not** send `minimal_response` or `no_attributes` (presence strips attributes).
4. Extract states with numeric `latitude` / `longitude`.
5. Build per-entity point lists + a global timeline sorted by timestamp.
6. Actual depth may be shorter than requested if Recorder retention is shorter; show available data, no crash.

### 4.2 Idle (not playing)

- Pass full historical `paths` to `<ha-map>` (same shape as native map card: `HaMapPaths[]` with points, color, name, gradualOpacity).
- Pass configured location entities as `entities` (current `hass.states` positions).
- Include zone entities when configured (via `entities` list and/or explicit zones behavior matching native map card: zone domain entities render as zones on `ha-map`).

### 4.3 Playback / scrub

1. Timeline index `i` ∈ `[0, N-1]` (or time-based scrub mapped onto points).
2. For each entity, path shown = points with `timestamp <= t(i)`.
3. Entity marker position = last point at or before `t(i)` (if none, hide or keep last known per entity).
4. While playing: advance index with delays proportional to real Δt between samples, scaled so full run ≈ 30s (same idea as `historymapcard`).
5. Slider updates live; user scrub pauses playback and jumps to that index.
6. Current real-time entity positions from `hass.states` remain visible as the “live” markers when scrub is at the end; during scrub/play, historical position markers take precedence for tracked entities.

### 4.4 Refresh

- Refetch history when config entities/hours change, on connect, and periodically or when `hass` connection resumes (debounce; avoid hammering API).
- Cancel in-flight fetch on disconnect / config replace.

## 5. Configuration

```yaml
type: custom:trace-on-map-card
entities:
  - entity: device_tracker.phone
    name: Phone
    color: "#0288d1"
  - person.alice
  - zone.home                 # zones supported
hours_to_show: 24             # 1–720, default 24
default_zoom: 14
auto_fit: true
fit_zones: false
aspect_ratio: "16:9"          # optional; else fixed height like historymapcard (~400px) or HA default
theme_mode: auto              # auto | light | dark (dark_mode deprecated alias OK)
cluster: true
title: "Trace"
```

### Config keys

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `entities` | list | required | string or `{entity,name,color,focus?,label_mode?}` |
| `hours_to_show` | number | 24 | clamped 1–720 |
| `default_zoom` | number | 14 | passed to `ha-map` zoom |
| `auto_fit` | boolean | true | `ha-map` auto-fit |
| `fit_zones` | boolean | false | `ha-map` fit-zones |
| `aspect_ratio` | string | — | card height like native map |
| `theme_mode` | string | `auto` | `ha-map` theme-mode |
| `cluster` | boolean | true | `ha-map` cluster-markers |
| `title` | string | — | card header |

Editor: mirror these fields; hours input `min=1` `max=720`.

## 6. UI

- `ha-card` shell: optional title, map region (`ha-map`), timeline bar, legend.
- Timeline: play/pause, range slider, current time label, start/end labels.
- Legend: color dots + names for non-zone entities.
- Loading: subtle status while history loads; empty history → map still shows live entities, timeline disabled.
- Styles: HA CSS variables (`--primary-color`, `--card-background-color`, etc.).

## 7. Error handling

| Case | Behavior |
|------|----------|
| Missing/empty `entities` | `setConfig` throws (Lovelace shows config error) |
| `hours_to_show` out of range | Clamp silently to [1, 720] |
| History API failure | Log warn; keep live map; timeline empty + short error text |
| Entity without lat/lng | Skip for paths; live marker omitted by `ha-map` naturally |
| `ha-map` not defined | Show alert: HA frontend too old / map component missing |
| Recorder shorter than hours | Show whatever returned |

## 8. Packaging & delivery

- Build: TypeScript + Rollup → single `trace-on-map-card.js` ES module (no Leaflet bundle).
- Register: `customElements.define('trace-on-map-card', ...)` + `window.customCards` entry.
- `hacs.json`: content-in-root / filename for HACS frontend.
- README: HACS + manual install; example YAML; note that map tiles follow HA default map; Recorder retention may limit history; max 720h.
- CI: lint + unit tests (history normalize, clamp, path clip, playback index). Optional Playwright later.

## 9. Testing strategy

**Unit (Vitest)**

- Clamp hours; normalize entity configs.
- Extract timeline from history fixtures; sort; multi-entity merge.
- Clip paths to timestamp; playback step selection.

**Manual / HA**

- Card loads with default map tiles.
- With tile-replacement module enabled, card shows replaced tiles without card code changes.
- Play/scrub moves markers; zones/cluster/auto_fit behave.

## 10. File layout (target)

```
trace-on-map-card/
  package.json
  rollup.config.js
  tsconfig.json
  hacs.json
  README.md
  LICENSE
  trace-on-map-card.js          # build output
  src/
    trace-on-map-card.ts        # card element + registration
    editor.ts                   # UI editor
    history.ts                  # fetch + normalize + timeline
    playback.ts                 # play/scrub controller
    map-host.ts                 # ha-map bridge helpers
    types.ts
    utils.ts                    # clamp, format, colors
    test/
      *.test.ts
  docs/superpowers/specs/...
  docs/superpowers/plans/...
```

## 11. Risks

| Risk | Mitigation |
|------|------------|
| `ha-map` API drifts across HA versions | Document min HA version; defensive property sets; feature-detect custom element |
| Frequent path updates during play hurt perf | Throttle frame updates; reuse path object identity when possible |
| Large 720h histories | Cap hours; consider point downsampling only if needed after measurement |
| Shadow DOM / editor stacking | Contain layout; follow HA card editor patterns |

## 12. Success criteria

1. Install via HACS or `/local/trace-on-map-card.js` and add card to dashboard.
2. Map appearance matches HA default Map card (including any user tile replacement).
3. Multi-entity history paths + play/pause/scrub work.
4. zones / auto_fit / fit_zones / aspect_ratio / theme_mode / cluster configurable.
5. `hours_to_show` default 24, max 720, editor enforces range.
6. No TianDiTu (or other vendor) strings/URLs in source or README beyond “follows HA default map”.
