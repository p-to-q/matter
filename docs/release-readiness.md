# Release readiness

Matter can be deployed today only as an early, fixture-seeded preview. It is not
yet a public pre-release of the complete product loop.

## Current deployable slice

The current online-safe claim is narrow:

```text
/matter
  rooted fixture material
  local Markdown durability through IndexedDB
  ZIP export/import of the same strict Markdown tree
  file outline, focus/fold, copy, lasso, stretch projection
  fixture voice admission when explicitly enabled by deployment env
  derived navigation labels, with a fixture model adapter behind them
  no live model transformation
```

The preview may use `MATTER_TRANSCRIPTION_ADAPTER=fixture`. Production without
that explicit adapter leaves transcription unavailable by design. A live
transcription adapter remains gated by the deployment requirements in
[`reference/voice-input.md`](reference/voice-input.md).

`GET /matter/api/health` reports this boundary for deployment checks. It is a
no-store capability probe, not an uptime or dependency monitor.

## Candidate receipt — 0.2.0-preview.1

The integrated candidate was rebuilt from the latest `origin/main` and proved
sequentially on 2026-08-06:

```text
npm run check          doctor, links, 706 passed Vitest tests, typecheck, lint, build
npm run test:e2e       35 passed + 1 skipped Chromium cases at laptop, 390 px, and 320 px
npm run test:receipt   production 2,000-node renderer receipt
```

These receipts prove the fixture-seeded preview boundary only. They do not
promote the missing transform, live transcription, fresh empty-document start,
or deployed-origin device gates listed below.

## Hard gates before a public pre-release

- `POST /api/turn` does not exist yet, so the four-signal generative transform
  is still specified rather than running.
- ZIP export/import is implemented; directory export is not implemented and is
  intentionally outside this preview.
- The product opens with seeded fixture material, not a fresh empty document
  whose first action admits a root thought.
- Live transcription has no adapter, rate/spend guard, decoded-duration
  validation, deployed-origin Chrome/Safari receipt, or final voice-level UX.
- The deployed origin still needs the Phase 4 receipt in
  [`../plans/active-tree-material.md`](../plans/active-tree-material.md).

## Release discipline

Do not describe this as "Matter pre-release" without the qualifier
`fixture-seeded preview`. A public pre-release requires the complete no-keyboard
path:

```text
admit root → admit child → focus → transform → undo → reload → export → import
```

Until then, release work is limited to integration defects, error language,
accessibility, performance at protocol bounds, provider gates, responsive polish,
and verification. New durable concepts belong back in the active plan before
implementation.
