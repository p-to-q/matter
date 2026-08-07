# Release readiness

Matter can be deployed as an early, root-seeded proprietary preview. It is not
the complete generative product loop yet.

## Current deployable slice

The current online-safe claim is narrow:

```text
/matter
  one seeded root on the dedicated origin; local research may use expanded fixture material
  local Markdown durability through IndexedDB
  ZIP export/import of the same strict Markdown tree
  file outline, focus/fold, copy, lasso, stretch projection
  explicit canvas-pan mode and undoable cross-branch structural reparenting
  browser-native live voice admission (no fixture voice on the public origin)
  derived navigation labels, with a fixture model adapter behind them
  lightweight Ask Matter boundary, with its server-side answer adapter independently gated
  no live model transformation
```

Local e2e uses `MATTER_TRANSCRIPTION_ADAPTER=fixture` to prove the strict HTTP
boundary. The dedicated public preview uses `MATTER_TRANSCRIPTION_ADAPTER=browser`:
the Web Speech API owns recognition when available, while `/api/transcribe`
refuses to manufacture fixture speech. Its client build also fixes
`NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED=true` and
`NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED=true`, with
`NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED=true`; an unsupported Web Speech
browser records locally and runs the final transcript through a lazy Whisper
worker instead of sending audio to that refusing route. Fixture
proof uses the inverse capability pair and never contacts browser speech.

`GET /matter/api/health` reports this boundary for the default mount. A
dedicated-domain deployment with an empty `MATTER_BASE_PATH` reports the same
probe at `/api/health`. It is a no-store capability probe, not an uptime or
dependency monitor.

## Candidate verification — 0.2.0-preview.8

The proprietary candidate was rebuilt and verified locally on 2026-08-07:

```text
npm run check          921 tests passed + 1 skipped; doctor, links, typecheck,
                       lint, and browser-mode production build also passed
npm run test:e2e       39 passed + 2 skipped Chromium cases at laptop, 390 px, 320 px,
                       and a wide structural-drag fixture
npm audit              0 known vulnerabilities after bounded transitive overrides
npm run test:receipt   measured, but the strict 2,000-node raw long-task gate remains open
```

The current production diagnostic keeps 4,359 elements and a `93 ms` cold
task. Its measured fold p95 is `111.9–115.8 ms`, focus p95 is `113.5–116.5 ms`,
selection p95 is `34.2–39.7 ms`, and the maximum raw long task is `111 ms`, so
the unchanged `<100 ms` raw gate correctly fails. Most full-tree measurement
tasks now land below `100 ms`, but occasional complete-DOM remount spikes remain.
The root-seeded preview does not claim that large-tree release bound; the
viewport-DOM renderer decision remains open in the active plan.

These receipts prove the proprietary, root-seeded preview boundary. They do not
promote the missing transform, accounts/sync, or strict large-tree gate listed
below. The repository and release
artifacts are currently publicly visible for operational reasons, but remain
proprietary and `UNLICENSED`; `LICENSE` grants no public-use rights.

## Hard gates before a public pre-release

- `POST /api/turn` does not exist yet, so the four-signal generative transform
  is still specified rather than running.
- `POST /api/inquiry` validates a bounded selection-or-tree question; a live
  adapter is enabled only by server environment and otherwise returns an honest
  unavailable result. No memory adapter is connected; each answer is bounded to
  the submitted selection or virtual material tree.
- Inquiry has same-origin, per-instance burst, and concurrency guards. The
  owning Vercel project must retain a distributed
  Firewall rate rule and a provider spend ceiling; serverless instances do not
  share the in-memory limiter.
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
- `POST /api/repair` runs behind its own `MATTER_REPAIR_ADAPTER` gate and never
  blocks admission: every failure admits the words as heard. Its live adapter
  needs the same distributed rate rule and provider
  spend ceiling as inquiry, since it fires once per utterance rather than once
  per question.
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
