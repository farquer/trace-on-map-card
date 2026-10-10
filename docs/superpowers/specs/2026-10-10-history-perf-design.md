# Trace On Map Card — History / Timeline Performance

**Date:** 2026-10-10  
**Status:** Draft for review  
**Scope:** Performance only (no visual redesign)

## Problem

With `hours_to_show: 720` and `significant_changes_only=0`, History responses can be huge. Observed symptoms:

1. Long “Loading history…” time  
2. After loading disappears, slider cannot scrub and play appears dead  
3. Concurrent auto-refetch can hide loading while a newer request is still in flight  

Root causes (code paths):

- Empty timeline → `PlaybackController.scrub` / `play` early-return; slider `max=0`  
- Very large timeline → each scrub rebuilds clipped paths + map props on the main thread  
- `_fetchHistory` `finally` always hides loading even when the request was superseded by a newer token  

## Goals

1. 720h (and similar large windows) remain usable: scrub + play respond.  
2. Optional point budget via config; **omit = no limit** (preserve today’s default behavior).  
3. When a budget is set and exceeded, **lazy-load** History by time windows; downsample only within a single window if that window alone exceeds the budget.  
4. Clear UX when there is no location history.  
5. Adequate unit tests; no style-only changes in this work.

## Non-goals

- Card chrome / timeline visual redesign  
- Changing default History query flags (`significant_changes_only=0` stays)  
- Server-side recorder changes  

## Config

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `max_timeline_points` | number (optional) | *unset* | Soft budget for timeline points. **Omit or invalid → no limit.** If set, must be ≥ 1 (clamp; ignore non-finite). |

Example:

```yaml
type: custom:trace-on-map-card
entities:
  - person.farquer
hours_to_show: 720
max_timeline_points: 3000
```

Editor: optional number field “Max timeline points (blank = unlimited)” that writes the key only when the user enters a value.

## Behavior

### 1. Fetch mutex / loading (always)

- Only the latest `_fetchToken` may apply results or hide loading.  
- Superseded requests: discard payload; **do not** clear loading in `finally` unless `token === this._fetchToken`.  
- Starting a new fetch while one is in flight: bump token (existing pattern); show loading for the active fetch.  
- Auto-refetch (`shouldAutoRefetchHistory`) must not stack unbounded work: if a fetch is already in flight, skip starting another (or only bump to restart once in-flight completes — prefer **skip while in flight** to avoid cancel storms on slow 720h).

### 2. Empty timeline UX (always)

When `_timelinePoints.length === 0` after a successful apply (or no history entities):

- Disable slider and play button.  
- Show a short status message (reuse loading row or a dedicated hint): e.g. “No location history in this period.”  
- Failed fetch: keep existing alert; still disable controls if points are empty.

When points become non-empty: re-enable controls and clear the empty hint.

### 3. Scrub throttle (always)

- Slider `input` → schedule scrub via `requestAnimationFrame` or ≤ ~100ms throttle so rapid drags do not rebuild paths every event.  
- Final value on `change` / last rAF must apply exactly.

### 4. Unlimited mode (`max_timeline_points` unset)

- Single History request for full `[now - hours, now]` (current API path).  
- No downsampling, no windowing.  
- Mutex + empty UX + scrub throttle still apply.

### 5. Budget mode (`max_timeline_points` set)

Let `M = max_timeline_points`.

**Windowing (lazy load):**

1. Split `[start, end]` into time windows. Window count chosen so that a **full** download of all windows is avoidable on first paint; suggested default:  
   - `windowHours = max(1, ceil(hours_to_show / max(1, ceil(hours_to_show / 7))))` targeting ~7 windows for 720h (~≈103h each), or simply **fixed 24h windows** for predictability.  
   - **Decision for implementation:** use **calendar-aligned 24h windows** (UTC or local consistent with existing `toISOString` start). Last window may be shorter.  
2. **Initial load:** fetch the **last** window (most recent / “now”) first; extract points; build timeline + slider for that range; hide loading when first window applied.  
3. **Background / on scrub:** when playhead approaches or enters an unloaded window (with a small prefetch margin), fetch that window, merge points chronologically into `_timelinePoints`, update slider `max`, keep current playhead time stable (map index by timestamp, not raw index when merging).  
4. Track loaded window ids to avoid duplicate fetches; in-flight window fetches use the same token/mutex rules as full fetch (per-window tokens or a queue with cancel-on-config-change).

**Per-window downsample:**

- After extracting points for one window, if `windowPoints.length > M`, apply **uniform-in-time** downsample to `M` (always keep first and last point of that window).  
- Do **not** downsample across the whole multi-window timeline down to `M` (that would defeat lazy detail); the budget caps **density per window**.  
- Clarification vs earlier chat: “超过限额允许懒加载” = prefer loading more windows over one giant response; `M` caps each window’s contribution so a dense day cannot freeze the UI.

**Slider semantics with partial data (v1 decision):**

- Slider spans the **full** configured time range `[start, end]` by **time** (`timelineStartMs` / `timelineEndMs`).  
- Use a fixed slider resolution (e.g. `min=0`, `max=1000`); map value → target timestamp `t`.  
- Scrub avatar / clipped paths: nearest loaded point with `timestamp ≤ t` (per entity as today).  
- If `t` falls in an unloaded window → fetch that window (and prefetch neighbors); optional light “Loading segment…” without blocking the whole card.  
- Paths: draw only loaded points (gaps OK until windows fill in).

### 6. Playback

- Play advances across loaded points by index among **loaded** timeline points sorted by time.  
- When next point would enter an unloaded window, pause prefetch or await window (prefer await with short timeout then skip gap).  
- `ANIMATION_TOTAL_MS` still spans the **loaded** span’s timestamps (existing formula).

## Pure helpers (testable)

| Helper | Role |
|--------|------|
| `downsampleTimeline(points, maxPoints)` | Uniform-in-time; keep ends; no-op if `maxPoints` unset or `points.length ≤ maxPoints` |
| `buildHistoryWindows(start, end, windowMs)` | List of `{ start, end, id }` |
| `mergeTimelinePoints(a, b)` | Merge + sort + optional dedupe by `(entityId, timestamp)` |
| `clampMaxTimelinePoints(raw)` | `undefined` if unset/invalid; else `max(1, floor(n))` |

## Card wiring

- Extend `TraceOnMapCardConfig` + `normalizeCardConfig` / editor.  
- `_fetchHistory` refactored into: full fetch (unlimited) vs windowed orchestrator (budget).  
- `_historyFetchInFlight` boolean or token ownership for auto-refetch skip.  
- Disable/enable play + slider helpers.

## Tests

1. `clampMaxTimelinePoints` / omit = unlimited  
2. `downsampleTimeline` keeps ends, respects M, no-op when under M  
3. `buildHistoryWindows` coverage of range  
4. `mergeTimelinePoints` order + dedupe  
5. Fetch mutex: superseded `finally` does not hide loading; in-flight skips auto-refetch  
6. Empty timeline disables controls  
7. Scrub throttle: multiple inputs → bounded `_onPlayback` / scrub calls (fake timers)  
8. Budget mode: initial last-window only; scrub into earlier window triggers another API path (mock `callApi`)

## Risks

| Risk | Mitigation |
|------|------------|
| Index shift when merging windows | Prefer timestamp-stable playhead |
| Many small API calls | 24h windows; prefetch adjacent only; skip duplicate ids |
| Unlimited 720h still heavy | Document that setting `max_timeline_points` is recommended for large hours |
| HA history period API per window | Same `buildHistoryApiPath(windowStart, ids)`; end bound is implicit “until now” today — **verify** whether HA accepts an end time; if not, filter client-side to `window.end` after fetch |

## HA API note

Current path: `history/period/{start}?filter_entity_id=...&significant_changes_only=0` (no end). For middle windows, fetch from `window.start` and **filter** states with `timestamp < window.end` client-side (and `≥ window.start`). Overlap at boundaries: dedupe on merge.

## Success criteria

- With `hours_to_show: 720` and `max_timeline_points: 3000`, card becomes interactive after first window; scrub/play work; earlier days load as needed.  
- With no `max_timeline_points`, behavior matches pre-change except mutex, empty UX, and scrub throttle.  
- Unit tests above pass; no unrelated style edits.
