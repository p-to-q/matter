# Release readiness

Matter can be deployed as an early, root-seeded proprietary preview. It is not
the complete generative product loop yet.

## Current deployable slice

The current online-safe claim is narrow:

```text
/matter
  rooted fixture material
  local Markdown durability through IndexedDB
  ZIP export/import of the same strict Markdown tree
  file outline, focus/fold, copy, lasso, stretch projection
  browser-native live voice admission (no fixture voice on the public origin)
  derived navigation labels, with a fixture model adapter behind them
  no live model transformation
```

Local e2e uses `MATTER_TRANSCRIPTION_ADAPTER=fixture` to prove the strict HTTP
boundary. The dedicated public preview uses `MATTER_TRANSCRIPTION_ADAPTER=browser`:
the Web Speech API owns recognition in the browser, while `/api/transcribe`
refuses to manufacture fixture speech.

`GET /matter/api/health` reports this boundary for the default mount. A
dedicated-domain deployment with an empty `MATTER_BASE_PATH` reports the same
probe at `/api/health`. It is a no-store capability probe, not an uptime or
dependency monitor.

## Candidate verification — 0.2.0-preview.5

The proprietary candidate was rebuilt and verified locally on 2026-08-06:

```text
npx vitest run --exclude CanvasChrome.test.ts --exclude inquiry-composer.test.ts
                       726 release-owned tests passed; doctor, links, typecheck,
                       lint, and browser-mode build also passed
npm run test:e2e       35 passed + 1 skipped Chromium cases at laptop, 390 px, and 320 px
npm run test:receipt   measured, but the strict 2,000-node raw long-task gate remains open
```

The production diagnostic keeps 4,314 elements, a `64–68 ms` cold task, and
`93–100 ms` measured structural tasks after warmup. A first full 2,000-node
structural remount still reaches `105–114 ms`, so the unchanged `<100 ms` raw
gate correctly fails. The fixture-seeded preview does not claim that large-tree
release bound; the viewport-DOM renderer decision remains open in the active plan.

These receipts prove the proprietary, root-seeded preview boundary. They do not
promote the missing transform, accounts/sync, or strict large-tree gate listed
below. The repository and release
artifacts are currently publicly visible for operational reasons, but remain
proprietary and `UNLICENSED`; `LICENSE` grants no public-use rights.

## Hard gates before a public pre-release

- `POST /api/turn` does not exist yet, so the four-signal generative transform
  is still specified rather than running.
- ZIP export/import is implemented; directory export is not implemented and is
  intentionally outside this preview.
- The product opens with seeded fixture material, not a fresh empty document
  whose first action admits a root thought.
- The complete 2,000-node tree remains authoritative and pointer-ready, but a full
  structural remount still exceeds the strict `<100 ms` raw long-task gate. The
  viewport-DOM renderer fork requires a separate product/architecture freeze.
- Browser-native live transcription is enabled, but browser support and vendor
  service behavior vary; it is not claimed to be offline or universally private.
- A real server transcription fallback still needs its own provider, rate/spend
  guard, decoded-duration validation, and deployed-origin device receipt.
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
