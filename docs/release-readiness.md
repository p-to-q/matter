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

## Candidate verification — 0.2.0-preview.16

Preview.16 makes the launch configuration enforce the live-model product claim
and makes the pool behind it able to keep that claim from the deployed region.
The public runtime declares label, transcript-repair, and inquiry gates as
`live`, and the deployment receipt requires all three health surfaces to be
`available`. The pool now bounds one relay's share of a caller's deadline, so a
hanging relay can no longer spend the whole budget alone, and the three
scenario deadlines carry two attempts rather than one. It does not add a
transform route or relax the model-provider boundary. The release runner's
POSIX socket fixture now skips only on hosts that forbid loopback binding;
where the capability exists it retains the original grandchild-port cleanup
proof.

```text
release proof          npm run check: 960 Vitest passed, 1 opt-in live-pool
                       skip; 29 Node tests passed; doctor, docs, typegen,
                       typecheck, lint, Vercel configuration, and production
                       build passed
browser proof          npm run test:e2e: 44 Chromium cases passed, 2 skipped,
                       including inquiry Enter/Shift+Enter, scoped reply
                       lifecycle, browser voice, local Whisper, lasso ink
                       clipped to the paper and its echo through a rounded
                       corner, archive, and tree interactions at laptop,
                       390 px, and 320 px
live-path proof        a local production build against the same relay pool
                       answered /api/label with source=model and /api/inquiry
                       with status=answered
deployment requirement after promotion, npm run check:deployment must report
                       the preview.16 version and all three model surfaces as
                       available; separately, all three must answer from the
                       deployed origin — /api/label source=model, /api/repair
                       source=model on an utterance that needs punctuation,
                       and /api/inquiry status=answered. `available` is a
                       configuration fact, not a reachability one, so the
                       second probe is the only evidence that the released AI
                       surfaces actually answer
```

## Candidate verification — 0.2.0-preview.18

Preview.18 is one measured tuning change, taken from the preview.17 promotion
receipt rather than from reasoning.

```text
deployed origin        inquiry answers in 1.3-2.2 s with a 16 s budget
                       (8 s per attempt); label spends its whole 6 s budget
                       (3 s per attempt) and falls back; repair likewise
reading                the first call from a cold function pays the connection
                       before the model, and only the wider budget survives it
change                 label 6 s -> 12 s, browser bound 7 s -> 13 s. Repair
                       keeps its short budget: a person is holding still for it
                       and the words as heard are the better answer. Nothing on
                       screen waits for a label
release proof          npm run check: 961 Vitest passed, 1 opt-in live-pool
                       skip; 29 Node tests; npm run test:e2e: 45 passed,
                       2 skipped
```

## Candidate verification — 0.2.0-preview.17

Preview.17 is an issue-closing line. It changes no interface: the rail, the
paper, the bubble, and every control keep their shape and copy. What changes is
what happens underneath them.

- a branched thought carries its own id and timestamp rather than a build
  constant that reached exported Markdown frontmatter;
- material clears the editing rail at every tested phone width; the 341–389px band was
  never measured and overlapped by up to 18px;
- an unanswered inquiry names its scenario outcome, so a released model surface
  can be diagnosed rather than guessed at;
- the two interaction flakes CI was retrying away were unstable pointer
  coordinates in the tests, not product races. Both now hover the element they
  mean, so the assertion tests the product rule instead of the canvas position.

```text
release proof          npm run check: 961 Vitest passed, 1 opt-in live-pool
                       skip; 29 Node tests passed; doctor, docs, typegen,
                       typecheck, lint, Vercel configuration, and production
                       build passed
browser proof          npm run test:e2e: 45 Chromium cases passed, 2 skipped
flake proof            five consecutive full-suite runs at retries: 0, no
                       failures. The same suite failed roughly two runs in five
                       before, on the unmodified tree
narrow-width proof     material clears the rail at the eight measured widths
                       320, 341, 360, 375, 376, 389, 390, and 414px
```

## Promotion receipt — 0.2.0-preview.16

Promoted to `main` and served from `matter.ptoq.io` on 2026-08-09.
`npm run check:deployment -- https://matter.ptoq.io --wait=120` matched the
version on the first probe, with all three model surfaces `available`.

```text
transcript repair      answered live from the deployed origin in 0.909 s,
                       source=model, on an utterance that needed punctuation.
                       Repair has no cache, so this is a real relay call and
                       the first proof that the pool is reachable from hkg1.
                       It is intermittent: later calls at a wider 3.4 s single
                       attempt still timed out, so the relay is sometimes under
                       a second and usually several seconds away from hkg1
thought label          answered source=model in 1.489 s. Labelling caches and
                       coalesces, so this is a live call or a late answer read
                       back from that cache; either way a person sees a name
inquiry                still unanswered. Every call spends the whole 16 s
                       budget and returns 503, then the governor cools down.
                       Not a relay-speed problem: the same pool answers repair
                       in under a second from the same deployment, and a local
                       production build against the same relays answers the
                       identical inquiry request in ~1.1 s, repeatedly
```

So preview.16 fixes two of the three surfaces the previous release only
claimed. Inquiry — the one with no floor — is still down, and its browser
message is a truthful, retryable "could not answer just now" rather than an
invented answer. The remaining difference between it and the two that work is
inside the scenario, not in the relays: prompt size, output ceiling, and the
per-scenario governor are the untested candidates, and the token cap is already
ruled out (every relay answers a 720-token request in about a second). The next
step is to make the failure legible before guessing again — the inquiry error
carries no reason, while label and repair both report `fallbackReason`, so
nothing outside the function can tell a timeout from a rejection.

Widening deadlines further is not that step. Repair was given a single 3.4 s
attempt and still timed out on three consecutive calls after answering one in
0.909 s, which is the shape of a connection cost paid per cold relay rather
than of a model that needs more time. Every further second is spent by a person
holding still, so the next move is measurement — and, if the reading holds, a
warm connection or a nearer relay rather than a longer wait. Tracked in
issue #52.

The credentials, pool endpoint, and model ordering remain Vercel-encrypted
server environment values. Distributed rate limits and a provider spend ceiling
remain the outstanding production control in issue #34.

One pre-existing intermittent browser failure is carried into this release
rather than hidden: `canvas-chrome.spec.ts` occasionally loses the inquiry
reply when a lasso begins, roughly one full-suite run in three, and CI's two
retries absorb it. It reproduces on the unmodified preview.15 tree, so it is
not introduced here — preview.15 is live with it now — and it is not understood
yet. Two mechanisms can produce it and neither has been proven: the
material-scope comparison discarding the exchange, or the paper's outside-
pointer dismissal closing the bubble on the same gesture the assertion races.
A dedicated repro loop of that sequence did not reproduce it in 40 attempts, so
the trigger involves more of the session than the gesture itself.

Carrying it was a deliberate trade, not an oversight, and retries are not
offered as proof. Holding preview.16 would keep a live outage in place — all
three released model surfaces currently answer nothing in production — to avoid
an intermittent reply loss that is already shipped. It is the first thing to
take after this release, and the reply-loss race should be reproduced under
instrumentation rather than re-derived by reading.

## Candidate verification — 0.2.0-preview.15

Preview.15 is the reviewed fixture-seeded preview following the live-gate
integration. It keeps the root-seeded, local-first material claim and does not
turn Ask Matter into durable chat: a visible answer survives callback churn for
the same bounded material scope, but a real scope change or closing the bubble
still discards the transient thread.

```text
release proof          npm run check: 952 Vitest passed + 1 skipped; 28 Node
                       tests passed; doctor, docs, typegen, typecheck, lint,
                       and the production build all passed
browser proof          npm run test:e2e: 43 Chromium cases passed + 2
                       capability-gated skips, including the real on-device
                       Whisper worker, inquiry Enter and Shift+Enter, voice,
                       lasso, archive, tree move, and the 2,000-node material
                       index at laptop, 390 px, and 320 px
dependency proof       root and archived public lockfiles resolve nanoid 3.3.17;
                       npm ci reported 0 vulnerabilities
origin baseline        before promotion, matter.ptoq.io reported preview.14 at
                       the dedicated root with the three model gates available
```

The earlier browser receipt briefly failed because the new inquiry regression
assertion began a lasso stroke outside the bubble. That pointer-down is the
existing, intentional close boundary for a lightweight non-persistent inquiry,
so the assertion was removed rather than changing Matter into a permanent chat
surface. The final focused canvas receipt and the full suite pass.

Preview.15 does not resolve the external deployment-control gap: distributed
rate rules and a provider spend ceiling remain required for the live label,
repair, and inquiry gates. The release remains a proprietary fixture-seeded
preview; no transform API, accounts, server material storage, hidden retrieval,
or persistent assistant history is claimed.

## Candidate verification — 0.2.0-preview.14

Preview.14 opens the three model gates on the deployed origin and corrects the
surfaces those gates make reachable. `matter.ptoq.io` and a local `.env.local`
now carry the same label, repair, and inquiry configuration.

```text
release proof          npm run check: 950 Vitest passed + 1 skipped; 32 Node
                       tests passed; doctor, docs, typegen, typecheck, lint,
                       and the production build all passed
browser proof          npm run test:e2e: 43 passed + 2 capability-gated skips
                       across 45 Chromium cases
parity proof           /api/health reports thoughtLabel, transcriptRepair, and
                       inquiry as available on the deployed origin, matching a
                       local run with the same three gates
```

Corrections shipped with it, each one a state a live provider produces:

- English spoken-punctuation substitution is removed from admission. "period"
  and "comma" are ordinary nouns, so the rule rewrote wording, which
  [`material.md`](material.md) forbids on the human path. CJK substitution
  remains and now skips a punctuation word following a determiner.
- A rate-limited or shed inquiry is reported as refused, not as never sent.
- A label queue dropped on cooldown releases its session entries, so one bad
  endpoint window no longer costs those rows their label for the session.
- Enter and Escape yield to an IME composition wherever they commit or discard,
  including the durable canvas title.
- The material index is localized; `<html lang>` follows the canvas language.
- A modal's inert set is live rather than a one-time snapshot and now covers the
  docked material index.
- The inquiry dictation and Ask controls meet the 24 CSS px floor, and the
  browser receipt that claims that floor now actually measures them.

One parity gap was found by measurement rather than by reading. Transcript
repair answered from the model on localhost but timed out on roughly half of
production requests and fell back to the verbatim floor. Its deadline scales
with the utterance — about 1.5s for a short one, because repair fires once per
utterance and must not delay admission — and a cross-Pacific hop from `iad1` to
the pool spent most of it. Pinning the functions to `hkg1` in `vercel.json`
closed it: six consecutive production repairs answered from the model with text
identical to localhost. The deadline was not relaxed, and the deployment check
now requires a region to be pinned.

```text
parity receipt         localhost and matter.ptoq.io, same version, all three
                       gates available, label and repair both source=model,
                       inquiry answered on both
```

Outstanding and deliberately not claimed: the distributed rate rules and
provider spend ceiling in issue #34 are still absent, so the gates are open
without an abuse or cost control. The `lasso-flow` stretch flake recorded under
Preview.13 is unchanged.

## Candidate verification — 0.2.0-preview.13

Preview.13 changes no product code. It makes the repository deployable again and
makes the constraint that broke it executable.

Preview.8 moved the dedicated-domain build shape into an environment prefix
inside `vercel.json`'s `buildCommand`, which grew that string to 340 characters.
Vercel rejects a `buildCommand` over 256 during deployment schema validation,
before any build step, so the eight production deployments from Preview.8 to
Preview.12 all failed with no build log and `matter.ptoq.io` stayed on
Preview.7. Source, tags, and GitHub CI stayed green throughout, because nothing
verified that the committed configuration was one Vercel would accept.

The build shape now lives in `build.env`, its server-read subset in `env`, and
`buildCommand` is `npm run build`. `npm test` checks the length bound, both
shapes, agreement between them, and the absence of any credential-shaped entry.

`npm run check:deployment` also runs for the first time. Its retry clock
defaulted to an unbound `performance.now`, which throws when called, so the real
gate exited with `deployment: check failed` for every origin — healthy or not —
while its tests passed because each one injected a clock. Preview.13 is the
first candidate whose deployed-origin receipt means anything.

```text
release proof          npm run check: 943 Vitest passed + 1 skipped, and 29 Node
                       tests passed, including 12 new deployment-configuration
                       cases; doctor, docs, typegen, typecheck, lint, and the
                       production build all passed
browser proof          npm run test:e2e: 43 passed + 2 capability-gated skips
                       across 45 Chromium cases
deployment proof       the same commit is accepted by Vercel's deployment schema
                       and verified with
                       npm run check:deployment -- https://matter.ptoq.io
```

Local runs at `retries: 0` showed `lasso-flow.spec.ts` "lasso addresses wrapped
language at laptop width" failing intermittently — roughly two runs in five —
when its stretch re-grab measures a handle the layout has not settled. It passes
alone and on a clean checkout, and no Preview.13 change touches runtime code. CI
sets two retries, which is why the suite has read as uniformly green. This is an
open interaction-proof defect, recorded rather than retried away.

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
