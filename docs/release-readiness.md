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
  transient working-context subtraction without hiding or rewriting material
  explicit canvas-pan mode and undoable cross-branch structural reparenting
  FX-off structural paper ruling and one passage-local Branch/Focus lens
  browser-native live voice admission (no fixture voice on the public origin)
  deterministic navigation labels, with an independently gated managed proposal
  immediate transcript admission, with local repair rules and an independently gated managed proposal
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

## Candidate verification — 0.2.0-preview.33

Preview.33 corrects the auxiliary canvas layer without moving material. The
dashed one-pixel ruling is now legible across the full paper and its repeated
cell origin follows explicit Pan while its paper-space span stays fixed through
material zoom. Each responsive cell width remains exactly the established online
column width plus gap (`520 + 116`, `280 + 64`, or `236 + 56` px); only the
non-authoritative vertical reference rhythm is more open. Both axes retain one
screen-space `7px / 17px` dash rhythm and a fixed screen phase through pan and
zoom.
The ruling remains pointer-inert and outside material, history,
persistence, context, and protocol.

Direct hover, keyboard focus, or coarse selection now reveals one upper-left
frosted field and all of its currently projected actions in the same frame.
Full view retains Branch and Focus; focus view retains Show all. The presenter
still revalidates the active node and revision immediately before dispatch and
yields to lasso, stretch, pan, wheel motion, node drag, pending work, held
material, overlays, and unsafe geometry.

```text
source proof           npm run check: 1,151 Vitest passed, 2 skipped; 48 Node
                       tests passed; doctor, docs, architecture, typegen,
                       typecheck, lint, and production build passed
browser proof          npm run test:e2e: 56 Chromium cases passed, 2
                       capability-gated cases skipped; focused 8-case ruling/
                       field matrix passed at light/dark, laptop/narrow,
                       keyboard, coarse pointer, held context, Pan and 2,000 nodes
layout proof           browser receipts freeze the online 520/116 and 280/64
                       column tokens; Pan translates the ruling, while material
                       zoom leaves its cells and phase unchanged
scale proof            one full-paper ruling and at most one delegated field are
                       mounted at 2,000 nodes; geometry is pure O(1) per camera
                       update and creates no per-node controls or measurements
product boundary       no authored coordinates, snapping, layout refit, local
                       delete/fold, blank AI nodes, new intents, or new durable/
                       transmitted state
```

## Candidate verification — 0.2.0-preview.32

Preview.32 gives the leaf-off paper a quiet structural rhythm without turning
Matter into a coordinate editor. One solid, low-contrast ruling repeats the
derived column and vertical steps, remains fixed to the paper during camera
movement, and never enters material, hit testing, persistence, or protocol.

One shared action lens now serves the complete canvas rather than mounting
controls per passage. It measures the real first line of the current text and
prefers its upper-right clear space. Full view offers the existing undoable
Branch and transient Focus actions; focus view offers Show all. Fine pointers
hover, coarse pointers act from selection, and keyboard focus enters with
ArrowRight, moves through the vertical toolbar, and returns with Escape. Lasso,
stretch, pan, wheel motion, node drag, pending work, held-aside material, canvas
chrome overlays, stale tree revisions, and unsafe adjacent space all remove the
lens.

```text
source proof           npm run check: 1,146 Vitest passed, 2 skipped; 48 Node
                       tests passed; doctor, docs, architecture, typegen,
                       typecheck, lint, and production build passed
browser proof          npm run test:e2e: 55 Chromium cases passed, 2
                       capability-gated cases skipped; the focused 7-case
                       ruling/lens matrix passed at light/dark, laptop/narrow,
                       keyboard, true coarse pointer, held context and 2,000 nodes
scale proof            one ruling and at most one lens are mounted at 2,000 nodes;
                       the production receipt kept 4,463 elements and responsive
                       fold/focus/selection samples, while its 122 ms raw cold task
                       honestly leaves the existing <100 ms optimization gate open
product boundary       no snapping, free coordinates, local delete/fold, blank AI
                       nodes, second tool catalog, or new durable/transmitted state
```

## Candidate verification — 0.2.0-preview.31

Preview.31 gives the person a transient working-context boundary without
creating a second material model. Directory disclosure remains `›` / `⌄`; a
quiet trailing `−` holds one branch aside, and the branch's persistent `+`
returns it. Held material remains faintly legible but is unavailable to normal
selection, lasso, and Ask Matter. Its ids never enter the document, command
history, persistence, archive, or request payload.

The browse index derives parent-owned relationship segments in one linear
projection over the visible outline. Only adjacent siblings in a group that
continues deeper receive a segment; singleton and terminal leaf groups remain
unmarked. A 1 px rail shares the disclosure/selection axis, with 8 px clearance
at controls and 6 px at blank leaf joints. Windowing clips those pure segments
without DOM measurement.

The release also advances the existing Nano ID 3.x transitive override to
3.3.18, the patched version for its zero-length custom-generator denial of
service advisory. Matter does not call that generator path; the update removes
the known vulnerable package from both the active lockfile and its archived
prototype lockfile without changing a dependency line or product behavior.

```text
source proof           npm run check: 1,136 Vitest passed, 2 skipped; 48 Node
                       tests passed; doctor, docs, architecture, typegen,
                       typecheck, lint, and production build passed
browser proof          npm run test:e2e: 48 Chromium cases passed, 2
                       capability-gated cases skipped; desktop and narrow
                       disclosure, recovery, search, Select, Ask Matter,
                       deletion/Undo, and 48 px pointer targets passed
scale proof            exact 2,000-row / 32-level guide projection passed;
                       the existing full-canvas remount gate remains the
                       separately recorded release risk below
privacy boundary       held material cannot leak through pointer selection,
                       lasso measurement, aggregate count, or inquiry payload
```

## Candidate verification — 0.2.0-preview.30

Preview.30 is an operational-contract correction over Preview.29. The deployed
repair route already requires `transcript-repair/4`; the cross-surface pool probe
now sends that same version and its test freezes the equality. Product behavior,
material documents, UI, history, and network response shapes do not change.

```text
source proof           focused Node probe contract, typecheck, lint, production
                       build, architecture, doctor, docs and diff checks passed
browser proof          unchanged from Preview.29: 46 Chromium cases passed, 2
                       capability-gated cases skipped
operational boundary   a probe contract mismatch can no longer masquerade as a
                       provider or transcript-repair failure
```

## Candidate verification — 0.2.0-preview.29

Preview.29 strengthens the spoken-to-written boundary without turning admission
into a writing assistant. The dependency-free local floor now applies ordered,
literal-safe repair across English, Simplified and Traditional Chinese,
Japanese, and German, including only high-confidence spoken percentages,
decimals, measures, dates, times, and version spans. One managed proposal may
faithfully redraft a proven broken spoken seam, but the browser and store still
lock facts, stable identifiers, bounded vocabulary, speaker, modality, logical
relations, question type, and claim order before one separately undoable repair
can settle.

The right rail again exposes a single retreat direction: Undo. Exact Redo stays
available through `Cmd/Ctrl+Shift+Z` and `Ctrl+Y`, using the same durable inverse
journal without a second visible tool. Ask Matter's existing bounded bubble now
uses a presentation-only pending pulse and grapheme-aware terminal reveal; the
full answer remains its accessible name, restored answers do not replay, and no
partial text enters its record or protocol.

```text
source proof           npm run check: 1,118 Vitest passed, 1 skipped; 48 Node
                       tests passed; doctor, docs, architecture, typegen,
                       typecheck, lint, and production build passed
browser proof          npm run test:e2e: 46 Chromium cases passed, 2
                       capability-gated cases skipped; visible Undo, both Redo
                       shortcuts, inquiry arrival, repair, reload, archives,
                       narrow layouts, and 2,000-node diagnostics passed
repair proof           locale-exact positive, ambiguity, literal, semantic-lock,
                       idempotence, and model-adjudication corpora passed; no
                       worker download, transcript cache, or new dependency
product boundary       no visible Redo, repair controls or provider status;
                       no free style rewrite or durable partial inquiry answer
still gated            a fresh deployed source:model repair receipt and live
                       transform promotion; deterministic repair is complete
                       when every managed proposal fails
```

## Candidate verification — 0.2.0-preview.28

Preview.28 keeps one server-only provider foundation without making its product
surfaces one failure domain. Label and repair still share the ordered candidate
registry, credentials, transport, and prompt harness; candidate health is now
scoped to the scenario whose deadline observed it. A repair stall cannot reorder
label candidates, and a label success cannot clear repair's cooldown.

The left material index remains deterministic-first and quiet. The browser keeps
the same deadline through the complete label response body, cancels stale work
when the passage basis changes or disappears, treats bounded upstream fallback
as background failure, and repeats semantic validation before publishing or
storing a model label. A manual name continues to outrank every automatic path.
Transcript repair remains immediate-admission-first, rule-backed, separately
undoable, uncached, and visually unchanged from Preview.27.

```text
source proof           npm run check: 1,104 Vitest passed, 2 skipped; 48 Node
                       tests passed; doctor, docs, architecture, typegen,
                       typecheck, lint, and production build passed
browser proof          npm run test:e2e: 46 Chromium cases passed, 2
                       capability-gated cases skipped
isolation proof        295 focused pool/label/repair tests passed;
                       cross-scenario stall, cooldown and success remain local
fallback proof         deterministic label and transcript-rule floors remain;
                       no provider, cache, breaker, or fallback status enters UI
still gated            a fresh deployed source:model receipt for both label and
                       repair; configured health alone is not that proof
```

## Candidate verification — 0.2.0-preview.27

Preview.27 changes only how an already-committed transcript repair is perceived.
The heard baseline still remains visible for at least 650 ms and repair still
commits as one exact tree command. A bounded Myers grapheme diff then keeps
stable language still, reserves 160 ms for recognition, and reveals only
inserted or replaced units in reading order. Deletion-only repair cues one
adjacent seam glyph because the deleted text has no final glyph. At most 64
timing units finish below 800 ms; the short-lived before/after receipt and DOM
shape are released by 1.2 seconds.

```text
release proof          npm run check: 1,082 Vitest passed, 2 skipped; 48 Node
                       tests passed; doctor, docs, architecture, typegen,
                       typecheck, lint, and production build passed
browser proof          npm run test:e2e: 46 Chromium cases passed, 2
                       capability-gated cases skipped; laptop and 390px repair
                       flows observed delayed ordered grapheme arrivals while
                       unchanged text, opacity, accessible name, and pre/post
                       reveal geometry stayed exact
accessibility proof    reduced motion rendered the complete repaired text with
                       no animation; forced colors shares that final-state rule
material boundary      DOM textContent is canonical from the repair commit;
                       no old-text layer, token stream, per-character command,
                       timer per glyph, cache, status, or persistent fragment
still gated            the external managed model pool; deterministic rules
                       remain the complete offline repair path
```

## Candidate verification — 0.2.0-preview.26

Preview.26 makes the managed repair budget reachable in the deployed user
journey and narrows its visible effect to the material ink. One proposal gets a
six-to-eight-second server deadline inside the existing twelve-second material
lease; the browser bounds headers, body, and parsing at 8.8 seconds. The raw
transcript and deterministic floor remain the complete offline path, so the
additional wait never blocks admission and never creates a retry queue.

The canonical repaired text is present from its first frame. Its glyph color
settles once for 240 ms, while selection fill, focus outline, opacity, geometry,
hit testing, and accessibility remain steady. The feature-local presentation
owner survives React development effect replay but releases its retained text
receipt and timers on a real unmount. It remains presentation only: no old-text
layer, per-character DOM, status, history, persistence, archive, or context.

```text
release proof          npm run check: 1,067 Vitest passed, 2 skipped; 48 Node
                       tests passed; doctor, docs, architecture, typegen,
                       typecheck, lint, and production build passed
browser proof          npm run test:e2e: 45 Chromium cases passed, 2
                       capability-gated cases skipped; laptop and narrow voice
                       admission observed the repair animation while the text
                       control remained fully opaque
lifecycle proof        a Strict Mode release/retain replay keeps the owner live;
                       a real final release clears receipts, timers, and future
                       publications
product boundary       no typing simulation, correction badge, confidence UI,
                       provider status, transcript/output cache, or retry
still gated            a successful deployed managed-repair answer receipt;
                       health configuration alone is not that proof
```

## Production spot check — 0.2.0-preview.26

The deployment gate reached `matter.ptoq.io` after nine probes and confirmed
the Preview.26 version and capability shape. The hydrated interface restored
its bounded local material, enabled the voice and pointer tools, and exposed no
new repair, cache, or provider surface. Before hydration and voice readiness,
the same controls remained visible but inert rather than accepting a recording
they could not yet own.

Two generated repair utterances reached the new server budget in 6.72 and 6.59
seconds, then safely returned the unchanged floor with `MODEL_UNAVAILABLE`. One
generated cross-surface round returned repair `MODEL_UNAVAILABLE`, label
`MODEL_TIMEOUT`, and inquiry `MODEL_TIMEOUT`; that is a pool-down receipt, not a
repair-only fault. Health still reports the configured transcript-repair
capability, exactly as designed, but is not evidence that a relay answered.
Preview.26 therefore proves the longer repair path and its fallback online; a
managed repair answer remains gated on restoring a responding relay.

## Candidate verification — 0.2.0-preview.25

Preview.25 makes transcript repair a real staged path without making it a new
surface. Recognizer text still becomes human material immediately. An ordered,
locale-exact analyzer produces the offline floor; one bounded managed proposal
may then resolve a contextual restart, correction, misrecognition, or forced
grammar seam. Rules and model settle as one separately undoable repair command
after the baseline has remained visible for at least 650 ms. Failure keeps the
rules, and neither branch exposes status, retains transcript/output cache, or
receives material identity.

```text
release proof          npm run check: 1,066 Vitest passed, 2 skipped; 47 Node
                       tests passed; doctor, docs, architecture, typegen,
                       typecheck, lint, and production build passed
browser proof          npm run test:e2e: 45 Chromium cases passed, 2
                       capability-gated cases skipped; raw-before-repair,
                       managed repair, reload, two-step Undo, narrow layout,
                       lasso/stretch, archives, and 2,000-node diagnostics passed
repair boundary        33 runtime corpus groups cover punctuation, filler,
                       echo, stutter, restart, correction, ITN, literal guards,
                       idempotence, and negative semantic cases; server,
                       browser, and store independently adjudicate model output
product boundary       no repair panel, progress, typing simulation, transcript
                       cache, retry queue, retrieved context, material address,
                       or structure created by a spoken formatting command
still gated            a measured browser repair model and live transform
                       promotion; managed repair remains an optional proposal
                       above the deterministic offline floor
```

## Candidate verification — 0.2.0-preview.24

Preview.24 closes one speech-to-material boundary without widening the product.
The recognized transcript becomes durable material immediately; a detachable,
rules-only local repair may commit one separately undoable correction within a
twelve-second capability lease. First-use voice readiness prepares only an
unstarted browser recognizer or evaluated worker code graph, never permission,
audio, or model bytes. Ask Matter remains visually unchanged: its bounded local
record stays behind the existing inquiry, while strict response receipts now
distinguish application busy, provider timeout, temporary unavailability, and
an unreachable request without exposing provider prose.

```text
release proof          npm run check: 1,028 Vitest passed, 2 skipped; 47 Node
                       tests passed; doctor, docs, architecture, typegen,
                       typecheck, lint, and production build passed
browser proof          npm run test:e2e: 45 Chromium cases passed, 2
                       capability-gated cases skipped; voice admission,
                       on-device transcription, Undo/Redo, lasso, archives,
                       reparenting, narrow layouts, and 2,000-node diagnostics
                       all passed
product boundary       no repair status, cache UI, record manager, chat panel,
                       hidden retrieval, or new material authority
still gated            live transform provider and deployed-origin transform
                       receipt; local repair model remains a measured future
                       adapter, with deterministic rules as the complete floor
```

## Production spot check — 0.2.0-preview.23

Checked through the public interface on 2026-08-11. `matter.ptoq.io` loaded the
root-seeded canvas; selection, Branch, Undo, Redo, reload, and Undo/Redo after
reload all preserved the same local tree and history. Entering Lasso disabled
conflicting file actions and exposed the bounded selection guidance. The test
browser denied microphone permission, and the product returned to an idle,
retryable state with a permission instruction; this proves the denied path, not
real acoustic capture.

The inquiry health capability reported `available`, but one real bounded
inquiry spent its browser deadline and returned the retryable busy answer. A
later generated-data pool probe reached inquiry and received a model answer in
915ms; a second real browser question also answered, kept the input focused,
and produced no console warning. In the same probe, label reached the pool in
1.128s while repair used its deterministic floor after a 5.591s model timeout.
Preview.23 therefore proves an intermittent pool, not a permanently absent
inquiry provider. The health payload explicitly is not a dependency monitor,
and the old client also collapsed a provider timeout into `BUSY`; neither
signal may stand in for an actual answer receipt. The dedicated root is the
live product URL; `www.ptoq.io/matter` currently returns the marketing site's
intentional 404 and is not an alias.

## Candidate verification — 0.2.0-preview.22

Preview.22 is a source-preview convergence receipt. It does not widen Matter
into a workspace or promote live material transformation. It joins four
already-narrow paths: exact local undo/redo through reload; a bounded Ask Matter
record behind the existing inquiry; the fixture-gated transform vertical slice;
and first-turn voice readiness. The voice warm-up prepares only capability and
worker code. It never pre-asks for microphone permission, captures audio, or
downloads a speech model; a browser recognition start that never settles now
fails recoverably instead of remaining indefinitely pending.

```text
release proof          npm run check: 996 Vitest passed, 2 skipped; 47 Node
                       tests passed; doctor, docs, architecture, typegen,
                       typecheck, lint, and production build passed
browser proof          npm run test:e2e: 47 Chromium cases passed, including
                       browser speech, local transcription, undo, lasso,
                       archive, mobile chrome, reparenting, and 2,000-node
                       diagnostics
product boundary       Ask Matter record introduces no new panel, navigation,
                       or log manager; retained exchanges return only within
                       the existing inquiry surface
still gated            live transform provider, distributed rate/spend control,
                       deployed-origin transform receipt, and the strict
                       large-tree optimization target
```

The first remaining product proof is intentionally singular: execute the full
fixture transform loop in a browser, then undo, redo, and reload it. Until that
receipt exists, this is a source preview of the completed boundaries—not a
claim that live generative transformation is publicly ready.

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
selection p95 is `34.2–39.7 ms`, and the maximum raw long task is `111 ms`.
Most full-tree measurement tasks now land below `100 ms`, but occasional
complete-DOM remount spikes remain. The `<100 ms` target remains deliberately
visible and is never weakened to manufacture a pass; it is an optimization
target rather than a release veto. The viewport-DOM renderer decision remains
open in the active plan.

These receipts prove the proprietary, root-seeded preview boundary. They do not
promote the missing transform or accounts/sync. The repository and release
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

## Candidate verification — 0.2.0-preview.21

Two harness corrections found by measuring the pool from outside, and the
instrument that found them.

```text
refused answers      an adjudication rejection no longer counts toward the
                     provider cooldown. Three refusable requests in a row used
                     to take a surface off a live relay for 15 s, for everyone
                     on that instance, while it was answering all along
stalled relays       a candidate that spends its whole attempt without
                     answering now reaches the cooldown threshold in one event
                     rather than two. A fast refusal still needs two, because
                     it costs the next caller nothing
pool probe           npm run probe:pool <origin> asks repair, label, and
                     inquiry each round and reads fallbackReason rather than
                     status, so a floor answer is not mistaken for a working
                     pool
release proof        npm run check: 969 Vitest passed, 1 opt-in live-pool
                     skip; 52 Node tests passed
browser proof        npm run test:e2e: 45 Chromium cases passed, 2 skipped
```

Interface unchanged. The one-exchange inquiry change from preview.20 is
reverted: Ask Matter keeps its scrollable record, which is the product
decision.

## Candidate verification — 0.2.0-preview.19

Three durability and boundary slices, and the first release where the
architecture rules are enforced rather than described.

```text
load window            two lineages no longer resolve by revision. A commit
                       during the read raises the conflict a second tab
                       raises; neither version is overwritten
manual names           label writes return a typed receipt; a failed manual
                       write returns the row to its editor instead of looking
                       taken and vanishing on reload
architecture           npm run check:architecture holds 4 rules over 255 files;
                       all 3 recorded exceptions cleared first
release proof          npm run check: 963 Vitest passed, 1 opt-in live-pool
                       skip; 34 Node tests passed
browser proof          npm run test:e2e: 45 Chromium cases passed, 2 skipped
```

Interface unchanged, with one deliberate exception: a manual name whose write
fails returns to the editor it was typed in. That is the failure path, and it
previously presented as success.

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

- `POST /api/turn` is now a strict fixture-gated vertical slice. It still needs
  an end-to-end fixture/reload receipt, a separately enabled live provider, and
  deployed-origin rate/spend controls before it can support a public claim.
- `POST /api/inquiry` validates a bounded selection-or-tree question; a live
  adapter is enabled only by server environment and otherwise returns an honest
  unavailable result. No server memory adapter is connected; each answer is
  bounded to the submitted selection or virtual material tree.
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
