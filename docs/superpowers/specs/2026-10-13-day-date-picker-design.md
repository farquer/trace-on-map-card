# Trace On Map Card — Day Mode Date Picker

**Date:** 2026-10-13  
**Status:** Approved  
**Scope:** Let users jump to a calendar day in **天** mode via HA-native date UI (no third-party plugins)

## Problem

Day mode only supports ‹ › stepping. Jumping to an arbitrary past day is tedious.

## Goals

1. In **天** mode, pick a date directly (YYYY-MM-DD in HA time zone).  
2. Prefer **HA Core** widgets: `ha-date-input`, else `ha-selector` `{ date: {} }`.  
3. If neither custom element is registered, fall back to native `<input type="date">`.  
4. No new npm / HACS dependencies.  
5. `max` = today (HA TZ); future dates clamp to today (`offset = 0`).  
6. Selecting a date pauses playback, updates `_rangeOffset`, refetches History.  
7. Unit tests for YMD → offset math and card wiring (with mocked elements / fallback).

## Non-goals

- Week date/week picker (week stays ‹ › only)  
- Month / range pickers  
- Persisting last picked date  

## Decisions

| Topic | Choice |
|-------|--------|
| Modes with picker | **天** only |
| Widget priority | `ha-date-input` → `ha-selector` date → `<input type="date">` |
| Plugins | None (Core frontend only) |
| Future dates | Disallowed (`max=today`; clamp offset ≤ 0) |
| Week / 最近 | Unchanged |

## Behavior

```
[ 最近 ] [ 天 ] [ 周 ]

[ ‹ ]  [ date control: 2026-10-13 ]  [ › ]     # day
[ ‹ ]  10-12 ~ 10-18               [ › ]     # week (text)
最近 24 小时                                   # recent (nav hidden)
```

- Date control value always mirrors the active day window label.  
- `value-changed` / `change` → parse YMD → `dayOffsetFromYmd(now, tz, ymd)` → set offset → refetch.  
- ‹ › still work; sync updates the control value.

## Helpers

- `parseYmd(raw): {y,m,d} | undefined`  
- `todayYmd(nowMs, timeZone): string`  
- `dayOffsetFromYmd(nowMs, timeZone, ymd): number | undefined`  
  - calendar-day difference vs today in TZ; clamp ≤ 0  

## Risks

| Risk | Mitigation |
|------|------------|
| `ha-date-input` not registered on dashboard | Availability check + native fallback |
| `show-dialog` from shadow DOM | HA `fireEvent` is `composed`; same pattern as other HA widgets |
| Missing `hass.locale` | Pass when present; fallback input does not need locale |

## Success criteria

- Day mode: pick past date → History for that civil day.  
- Today selectable; future not applied as positive offset.  
- No plugin required; works with native fallback in tests.  
- Existing range tests still pass.
