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

## Candidate verification — 0.2.0-preview.9

Preview.8 remains an immutable receipt. Preview.9 adds the hydration hotfix and
the maintenance line below without changing the seeded-preview product claim:

```text
npm run check          928 Vitest tests passed + 1 skipped; 10 Node tests,
                       explicit typegen, typecheck, lint, docs, and production build passed
npm run test:e2e       41 passed + 2 capability-gated skips across 43 cases
runner proof           missing generated file, explicit E2E ownership, and
                       POSIX process-group interruption passed
provider proof         pre-abort, disconnect/deadline propagation, and
                       cancellation-without-cooldown passed
interaction proof      visible controls meet a 24 CSS px floor; the 44 px rail
                       visuals keep non-overlapping 72 px horizontal hit areas
```

No rendering model or performance threshold changed in this maintenance line;
the 2,000-node boundary above remains the honest open performance constraint.
These changes form Preview.9; they do not rewrite or move the Preview.8 tag.
Preview.9 is a GitHub source prerelease only: its exact package version is
ignored by the connected Vercel build. Production promotion remains tracked in
GitHub issue #34 and requires a later version after the provider controls exist.

## Candidate verification — 0.2.0-preview.10

Preview.10 retains the same source-prerelease-only deployment boundary. It
adds durable local undo, exact hierarchy presentation, and recording/lasso
interaction corrections without changing the public root-seeded claim:

```text
npm run check          938 tests passed + 1 skipped; doctor, links, explicit
                       typegen, typecheck, lint, and production build passed
npm run test:e2e       43 Chromium browser flows passed, including archive,
                       2,000-node windowing/performance, voice, lasso, move,
                       hierarchy, and reload-then-undo receipts
durability proof       tree and inverse journal write atomically; reload
                       validates every saved inverse before it is exposed
```

This exact package version is ignored by the connected Vercel build. The
GitHub prerelease is therefore a source candidate only, not a deployment of
`matter.ptoq.io`; production remains gated by issue #34 and a later version.
GitHub CI subsequently rejected Preview.10 because one old lasso E2E still
looked for the removed "Leave language selection" control. The immutable tag
remains an audit record; Preview.11 corrects that verifier rather than moving it.

## Candidate verification — 0.2.0-preview.11

Preview.11 changes the stale lasso exit assertion to the explicit re-click exit
contract for both lasso and Canvas pan. It also declares
`MATTER_LABEL_ADAPTER=live` in Vercel's non-secret
configuration, so the existing server pool can serve labels as soon as its
encrypted environment variables are configured. The exact version remains
ignored by Vercel until the handoff in
[`deployment-handoff.md`](deployment-handoff.md) is completed.

```text
npm run check          938 tests passed + 1 skipped; doctor, docs, typegen,
                       typecheck, lint, and production build passed
npm run test:e2e       43 Chromium browser flows passed; the persisted report
                       records no failed test, including lasso toggle, pan
                       toggle, voice, archive, tree move, and 2,000-node view
localhost inspection   root seed, default title, and post-hydration tool
                       availability checked against the live client surface
```

## Candidate verification — 0.2.0-preview.12

Preview.12 deploys the root-seeded browser experience from `main` again. The
server model adapters remain capability-gated: without encrypted provider
variables, labels keep their deterministic floor, transcript repair admits the
heard text, and Ask Matter truthfully reports that no answer model is connected.
That safe no-model mode is deployable; enabling a live model still requires the
separate controls in [`deployment-handoff.md`](deployment-handoff.md).

```text
focused proof          selected and default voice feedback clears every visible
                       text block at laptop and narrow widths; Enter, Shift+Enter,
                       visible Ask, pending, and composition boundaries are covered
release proof          npm run check: 943 passed, 1 skipped; npm run test:e2e:
                       45 passed; typecheck, lint, production build, and docs
                       link verification all pass
deployment proof       after Git integration deploys, check the dedicated origin
                       with npm run check:deployment -- https://matter.ptoq.io
```

## Product acceptance for the next candidate

The candidate must still look and behave like Matter after engineering work:

- the rooted material, not navigation or a release notice, remains the first
  visual signal;
- the manuscript index, full paper, leaf shadow, and one editing island remain
  the only strong composition; no dashboard cards, gradients, toast stack, or
  permanent infrastructure status is added;
- controls use the smallest honest label and expose a visible pointer target,
  keyboard focus, disabled state, and recovery path without explanatory chrome;
- fixture, browser-native, on-device, unavailable, and live-provider states are
  named truthfully; a fixture result never impersonates a live one;
- public material opens root-only, while expanded fixture branches remain a
  local/e2e proving surface;
- laptop, 390 px, reduced-motion, dark/light paper, menu, lasso, archive, and
  failure-recovery receipts show no overlap, clipped text, or console error.

This is a release acceptance boundary, not permission for another visual
redesign. The paper composition and its restrained monochrome vocabulary are
already the product's signature.

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
- Storage-full material remains in memory and now has a narrow-screen path to
  export and retry. A successfully imported foreign-id archive still needs one
  strict active-document pointer before reload can return to it; this is not a
  multi-document UI.
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

After the candidate is deployed, run:

```bash
npm run check:deployment -- https://matter.ptoq.io --wait=120
```

The probe fails on version drift, an incomplete capability schema, a non-empty
dedicated-domain base path, a revived `/matter` duplicate entry, or missing
edge security headers. The bounded wait only absorbs normal edge propagation;
it is intentionally post-deployment and does not belong in commit CI.

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
