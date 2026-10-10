# History / Timeline Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make large `hours_to_show` (e.g. 720) usable via fetch mutex, empty-state UX, scrub throttle, optional `max_timeline_points` with 24h lazy windows and per-window downsample.

**Architecture:** Pure helpers in `src/timeline-perf.ts` + small history-api/config updates; card orchestrates unlimited vs budget fetch; slider becomes time-mapped when budget mode is on. No visual redesign beyond disable/hint text.

**Tech Stack:** TypeScript, Vitest, existing custom element card (no new deps).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-10-history-perf-design.md`
- `max_timeline_points` omit/invalid → unlimited (no windowing, no downsample)
- Budget mode: 24h windows; downsample only per window if `length > M`
- Always: fetch mutex (stale `finally` must not hide loading), empty controls disabled, scrub throttle
- `significant_changes_only=0` unchanged
- Commit messages: `AI: #000000 <summary>。`
- No unrelated style polish

## File map

| File | Responsibility |
|------|----------------|
| `src/timeline-perf.ts` | `clampMaxTimelinePoints`, `downsampleTimeline`, `buildHistoryWindows`, `mergeTimelinePoints`, time↔slider helpers |
| `src/test/timeline-perf.test.ts` | Unit tests for helpers |
| `src/types.ts` | Add optional `max_timeline_points?: number` |
| `src/card-config.ts` | Normalize: omit key when unlimited; keep when set |
| `src/history-api.ts` | Optional `shouldAutoRefetchHistory` note / `inFlight` guard helper if useful |
| `src/editor.ts` | Optional number field for max points |
| `src/trace-on-map-card.ts` | Mutex fix, empty UX, throttle, unlimited vs windowed fetch, time scrub |
| `src/test/card-element.test.ts` | Integration: mutex, empty disable, budget first window + scrub fetch |
| `src/test/card-config.test.ts` / `editor.test.ts` | Config + editor |
| `README.md` | Document `max_timeline_points` |

---

### Task 1: Pure timeline helpers + tests

**Files:**
- Create: `src/timeline-perf.ts`
- Create: `src/test/timeline-perf.test.ts`

**Interfaces:**
- Produces:
  - `clampMaxTimelinePoints(raw: unknown): number | undefined`
  - `downsampleTimeline(points: TimelinePoint[], maxPoints: number): TimelinePoint[]`
  - `buildHistoryWindows(startMs: number, endMs: number, windowMs?: number): Array<{ id: string; startMs: number; endMs: number }>`
  - `mergeTimelinePoints(a: TimelinePoint[], b: TimelinePoint[]): TimelinePoint[]`
  - `sliderValueToTimestamp(value: number, min: number, max: number, startMs: number, endMs: number): number`
  - `timestampToSliderValue(t: number, min: number, max: number, startMs: number, endMs: number): number`
  - `indexAtOrBeforeTime(points: TimelinePoint[], t: number): number`
  - `HISTORY_WINDOW_MS = 24 * 3600 * 1000`
  - `TIME_SLIDER_MAX = 1000`

- [ ] **Step 1: Write failing tests** in `src/test/timeline-perf.test.ts` covering clamp omit/invalid/≥1, downsample keep ends / no-op under M, windows cover [start,end), merge sort+dedupe, slider round-trip, indexAtOrBeforeTime.

- [ ] **Step 2: Run** `npx vitest run src/test/timeline-perf.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement** `src/timeline-perf.ts`.

- [ ] **Step 4: Run tests** — expect PASS.

- [ ] **Step 5: Commit** `AI: #000000 添加时间轴性能纯函数与单测。`

---

### Task 2: Config + types + editor field

**Files:**
- Modify: `src/types.ts` — add `max_timeline_points?: number`
- Modify: `src/card-config.ts` — apply `clampMaxTimelinePoints`; if `undefined`, delete/omit from normalized object (do not force a default number)
- Modify: `src/test/card-config.test.ts`
- Modify: `src/editor.ts` + `src/test/editor.test.ts` — optional number input; empty clears key

**Interfaces:**
- Consumes: `clampMaxTimelinePoints`
- Produces: normalized config with optional `max_timeline_points`

- [ ] **Step 1: Failing tests** for omit / `3000` / invalid → unset.

- [ ] **Step 2: Implement** types + normalize + editor.

- [ ] **Step 3: Tests PASS; commit** `AI: #000000 支持配置 max_timeline_points。`

---

### Task 3: Fetch mutex + empty controls + scrub throttle (always-on)

**Files:**
- Modify: `src/trace-on-map-card.ts`
- Modify: `src/history-api.ts` if adding `inFlight` to `shouldAutoRefetchHistory`
- Modify: `src/test/history-api.test.ts`, `src/test/card-element.test.ts`

**Behavior:**
- `_historyInFlight` flag; auto-refetch skips when in flight
- `finally`: hide loading only if `token === this._fetchToken`
- `_setTimelineControlsEnabled(enabled: boolean)` + empty hint text on `#loading` or new `#hint`
- Slider `input` → rAF-throttled scrub; `change` flushes

- [ ] **Step 1: Tests** for shouldAutoRefetch with inFlight; card empty → disabled play/slider; mutex smoke if feasible.

- [ ] **Step 2: Implement** card changes (still single full fetch).

- [ ] **Step 3: PASS; commit** `AI: #000000 修复 History 竞态并禁用空时间轴控件。`

---

### Task 4: Budget mode — windowed fetch + time slider + per-window downsample

**Files:**
- Modify: `src/trace-on-map-card.ts` heavily
- Modify: `src/test/card-element.test.ts`
- Filter window points client-side after `history/period/{windowStart}`

**Behavior:**
- If `max_timeline_points` set: `buildHistoryWindows(start, end)`; fetch **last** window first; downsample window if `> M`; merge; set `timelineStartMs`/`EndMs`; slider `max=TIME_SLIDER_MAX`; scrub by timestamp via `indexAtOrBeforeTime`
- On scrub/play near unloaded window: fetch + merge; preserve playhead time
- Prefetch adjacent window ids; skip duplicates
- Unlimited path: keep index-based slider `max = points.length - 1` (current)

- [ ] **Step 1: Integration test** with mock `callApi` — budget config calls API with last-window start; scrub earlier triggers second call.

- [ ] **Step 2: Implement** orchestrator.

- [ ] **Step 3: PASS; commit** `AI: #000000 实现时间窗懒加载与时间轴滑条。`

---

### Task 5: README + build + final verification

**Files:**
- Modify: `README.md` — document `max_timeline_points`
- Run: `npx vitest run --coverage`, `npm run build`

- [ ] **Step 1: Doc + build + full test suite.**

- [ ] **Step 2: Commit** `AI: #000000 文档说明 max_timeline_points。`

- [ ] **Step 3: Push** if user requested / after local green.

---

## Manual check

1. `hours_to_show: 24` no `max_timeline_points` → same as before + empty/mutex/throttle.  
2. `hours_to_show: 720`, `max_timeline_points: 3000` → interactive after first day window; scrub left loads more.  
3. Failed/empty history → disabled controls + hint.
