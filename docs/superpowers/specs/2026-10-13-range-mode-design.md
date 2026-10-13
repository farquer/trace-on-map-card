# Trace On Map Card — Range Mode (最近 / 天 / 周)

**Date:** 2026-10-13  
**Status:** Approved (pending written-spec review)  
**Scope:** Runtime time-range selection with calendar navigation and dynamic History fetch

## Problem

Today the card only supports a rolling window `[now - hours_to_show, now]`. Users want to browse **calendar days / weeks** (and still keep “recent hours”), with prev/next navigation and data loaded for the selected window.

## Goals

1. Three runtime modes: **最近** | **天** | **周**.  
2. Day/week windows aligned to **Home Assistant `time_zone`**.  
3. Week = **Monday 00:00 → Sunday end** (inclusive calendar week in HA TZ).  
4. Default on open: **天 · 当日**.  
5. On “today / this week”: **disable next** (›).  
6. Switching mode or offset → pause playback, reset scrub, refetch History for the new window.  
7. Reuse existing fetch mutex, empty-state UX, scrub throttle, optional `max_timeline_points`.  
8. Adequate unit tests for window math (TZ-aware) and card wiring.

## Non-goals (this version)

- Month / custom date-range picker  
- Persist last mode/offset to `localStorage`  
- Changing map marker chrome beyond needed control layout  
- Server-side recorder changes  

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Modes | 最近 / 天 / 周 |
| Timezone for day/week bounds | HA `hass.config.time_zone` (fallback: browser local if missing) |
| Week start | Monday |
| Default mode | `day` (当日, offset 0) |
| Next at current period | Disabled |
| Rolling window | Mode `recent` uses `hours_to_show` |

## Config

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `hours_to_show` | number | `24` | Used only in **最近** mode (unchanged clamp 1–720) |
| `range_mode` | `'recent' \| 'day' \| 'week'` | omit | Optional YAML override for **initial** mode; if omit, runtime default is `day` |
| `max_timeline_points` | number | omit | Unchanged; applies to whatever window is fetched |

Example:

```yaml
type: custom:trace-on-map-card
entities:
  - person.farquer
hours_to_show: 24          # 仅「最近」
# range_mode: day          # 可选；不写则默认天·当日
max_timeline_points: 3000  # 可选
```

Editor: optional select for initial `range_mode` (最近 / 天 / 周); keep hours field labeled as applying to 最近.

## UI

Place a **range toolbar** under the map (above or below the existing timeline scrubber — prefer **above** the scrubber so mode is chosen before scrubbing):

```
[ 最近 ] [ 天 ] [ 周 ]

[ ‹ ]   2026-10-13   [ › ]     # day
[ ‹ ]  10-07 ~ 10-13  [ › ]    # week label in HA-local calendar dates
```

- Segmented control for mode (mutually exclusive).  
- In **最近**: hide `‹ ›`; show short caption e.g. `最近 24 小时` (from config).  
- In **天 / 周**: show prev/next; disable › when `offset === 0` (current day/week).  
- Labels formatted in HA timezone.  
- Style: HA theme tokens only (same polish language as existing chrome).

## Window math

All bounds computed in HA timezone, then converted to UTC `Date` / ms for History API.

### Day (`offset` integer, 0 = today)

- `start` = local midnight of `today + offset`  
- `end` = start of next local day (exclusive) or `23:59:59.999` inclusive — **prefer half-open `[start, end)`** where `end = start + 1 day` for cleaner merges  

### Week (`offset` integer, 0 = week containing today)

- Find Monday 00:00 of the week containing `today + 7*offset` days (or equivalently shift week index by `offset`)  
- `end` = Monday + 7 days (half-open `[start, end)`)  

### Recent

- `end = now`  
- `start = now - hours_to_show * 3600 * 1000`  
- No offset navigation  

### Helpers (pure, testable)

- `resolveHaTimeZone(hass): string`  
- `getDayWindow(now, timeZone, offset): { startMs, endMs, label }`  
- `getWeekWindow(now, timeZone, offset): { startMs, endMs, label }`  
- `getRecentWindow(now, hours): { startMs, endMs, label }`  
- `canGoNext(mode, offset): boolean` → false when mode is day/week and offset >= 0; recent always false for next (no next control)

Offset convention: **0 = current period, negative = past** (`-1` = yesterday / previous week). Next would be positive; since next is disabled at 0, offset never goes `> 0` in v1.

## Data / card wiring

1. State: `_rangeMode`, `_rangeOffset` (number, ≤ 0).  
2. On mode change: set offset to `0`, pause playback, recompute window, `_fetchHistory` for that `[start, end)`.  
3. On prev: `offset -= 1`, refetch. On next: if `offset < 0` then `offset += 1`, refetch.  
4. Fetch path:  
   - Prefer extending `buildHistoryApiPath(start, entityIds)` and **client-filter** points to `[startMs, endMs)` (same pattern as budget windows).  
   - For **最近**, keep current behavior (start = now - hours, filter optional).  
5. Budget / `max_timeline_points`: if set, reuse 24h sub-window lazy load **within** the selected range when the range is longer than one day (mainly **周** and long **最近**). Day mode is typically a single full fetch.  
6. Auto-refetch (`shouldAutoRefetchHistory`):  
   - **最近**: keep periodic refetch (updates “now”).  
   - **天 / 周** with `offset === 0` (today/this week): optional light refresh still OK so late points appear.  
   - **天 / 周** with `offset < 0`: **skip** auto-refetch (historical window is stable).  
7. Empty / error: existing messages; controls for scrub disabled when no points.

## HA timezone source

Use `hass.config.time_zone` (string like `Asia/Shanghai`). If absent, fall back to `Intl` / local. Document fallback in README.

Implementation note: prefer `Temporal` only if already available; otherwise use a small TZ helper via `Intl.DateTimeFormat` with `timeZone` option to get local Y-M-D and construct bounds without adding heavy deps if possible. If accurate DST boundaries need a library, evaluate `luxon` only if pure Intl proves insufficient — **prefer zero new deps**.

## Tests

1. Day window: given fixed `now` + `Asia/Shanghai`, offset 0/-1 → correct UTC ms bounds.  
2. Week window: Monday–Sunday in TZ; offset -1 previous week.  
3. `canGoNext` / offset clamp.  
4. Card: default mode day; switching to 最近 uses hours; prev enables next; at 0 next disabled.  
5. Fetch called with expected start after navigation (mock `callApi`).  
6. Auto-refetch skipped for past day offset.

## Risks

| Risk | Mitigation |
|------|------------|
| DST spring/fall | Half-open local midnights via TZ-aware construction; tests around DST if feasible |
| Missing `time_zone` | Fallback + README |
| Default day vs old “always recent” | Document breaking UX default; YAML `range_mode: recent` restores old feel |
| Week vs budget windows interaction | Clear: outer range = week; inner lazy 24h only if `max_timeline_points` set |

## Success criteria

- Open card → 天 · 当日, History for today in HA TZ.  
- ‹ loads yesterday; › disabled on today.  
- 周 shows Mon–Sun label; navigation works.  
- 最近 matches previous rolling hours behavior.  
- Unit tests above pass; no unrelated style redesign.
