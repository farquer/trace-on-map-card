# Range Mode (最近 / 天 / 周) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add runtime range modes 最近/天/周 with HA-TZ calendar windows, prev/next navigation, and History refetch per window.

**Architecture:** Pure window math in `src/range-window.ts` (Intl TZ, no new deps). Card holds `_rangeMode` / `_rangeOffset`, renders toolbar above scrubber, derives `[startMs,endMs)` then reuses existing fetch mutex / budget path. Config `range_mode` optional initial; default runtime `day`.

**Tech Stack:** TypeScript, Vitest, existing custom element card.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-13-range-mode-design.md`
- HA `time_zone`; week Mon–Sun; default day·today; next disabled at offset 0
- Offset ≤ 0; half-open `[start, end)`
- Zero new dependencies
- Commit: `AI: #000000 <summary>。`

## File map

| File | Role |
|------|------|
| `src/range-window.ts` | TZ helpers + getDay/Week/RecentWindow + canGoNext |
| `src/test/range-window.test.ts` | Unit tests |
| `src/types.ts` | `RangeMode`, `range_mode?` |
| `src/card-config.ts` | Normalize optional `range_mode` |
| `src/trace-on-map-card.ts` | Toolbar UI + state + fetch window source |
| `src/history-api.ts` | Auto-refetch skip for past day/week |
| `src/editor.ts` | Initial range_mode select |
| `src/test/card-*.ts` / editor | Integration |
| `README.md` | Document |

---

### Task 1: range-window helpers + tests

**Produces:** `resolveHaTimeZone`, `getDayWindow`, `getWeekWindow`, `getRecentWindow`, `canGoNext`, `clampRangeOffset`, `parseRangeMode`

- [ ] Tests for Shanghai day/week offsets, canGoNext, recent
- [ ] Implement Intl-based midnight + Monday find
- [ ] Commit

### Task 2: types + config + editor

- [ ] Add `RangeMode`; normalize `range_mode`
- [ ] Editor select 最近/天/周; hours label note for 最近
- [ ] Commit

### Task 3: card toolbar + fetch wiring

- [ ] State `_rangeMode` (default day), `_rangeOffset`
- [ ] DOM toolbar; CSS HA tokens
- [ ] `_resolveActiveWindow()` feeds `_fetchHistory`
- [ ] Mode/nav handlers pause + refetch
- [ ] Auto-refetch: skip when day/week && offset < 0
- [ ] Card tests + commit

### Task 4: README + build + push

- [ ] Docs; `vitest` + build; push

---
