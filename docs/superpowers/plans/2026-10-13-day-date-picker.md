# Day Date Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development.

**Goal:** Day-mode date jump via HA `ha-date-input` / `ha-selector` / native `<input type="date">` fallback.

**Architecture:** Pure YMD↔offset helpers in `range-window.ts`. Card swaps the range label slot for a date control in day mode only.

**Tech Stack:** TypeScript, Vitest, existing card; zero new deps.

## File map

| File | Role |
|------|------|
| `src/range-window.ts` | `parseYmd`, `todayYmd`, `dayOffsetFromYmd` |
| `src/test/range-window.test.ts` | Unit tests |
| `src/types.ts` | Optional `locale` on `HomeAssistant` |
| `src/trace-on-map-card.ts` | Date control in toolbar |
| `src/test/card-element.test.ts` | Fallback + select-day refetch |
| `README.md` | Brief note |

### Task 1: helpers + tests

- [ ] `parseYmd` / `todayYmd` / `dayOffsetFromYmd`
- [ ] Shanghai today/yesterday/future clamp tests
- [ ] Commit

### Task 2: card wiring

- [ ] Day mode: mount date control (priority list)
- [ ] Sync value/max; handler sets offset + refetch
- [ ] Week keeps text label
- [ ] Card tests + commit

### Task 3: README + build + push

- [ ] Docs; vitest; build; push
