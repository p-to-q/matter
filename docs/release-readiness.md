# Release readiness

Matter can be deployed as an early, root-seeded proprietary preview. It is not
the complete generative product loop yet. The current deployable source
identifies `0.2.0-preview.63`. PR #121 introduced the bounded local Wiki slice;
PR #122 refreshed its source-bound qualification receipt after the reviewed
release-reconciliation fix, yielding final source commit
`c691cc73f76c98ecf5cf83d425898d1b19023300`. Exact merged-main CI run
`36335534841` completed successfully, linked Production deployment
`6695177071` completed successfully, and a fresh no-store read from
`https://matter.ptoq.io/api/health` identified Preview.63 with `age: 0` and a
cache miss. The bounded `browser-preview` deployment checker matched in one
probe. That is deployed source identity, not an immutable release: no
Preview.63 tag or GitHub prerelease exists.

The same fresh public receipt keeps both material model surfaces
`unavailable`, and the anonymous `provider-session/4` receipt returns the exact
empty shape with `available: false`. Production Model API therefore remains
blocked by issue #104 until the deployment owner installs a valid independent
`MATTER_PROVIDER_SESSION_KEYS` ring and the resulting deployment passes the
strict checker. Publication also remains withheld until the strict six-round
managed-pool probe passes. The latest annotated tag and GitHub prerelease
therefore remain Preview.52 at `6a4931b`; neither may be advanced by borrowing
an older pool receipt. The repository maintainer operates only through GitHub:
a topic push triggers Preview and a `main` update triggers Production. No
manual Vercel command, project binding, credential, or environment edit is
part of this release. A package version alone proves neither source nor live
identity.

Receipts for Preview.8 through Preview.57 are trace in
[`../archive/release-readiness-history.md`](../archive/release-readiness-history.md).
This document keeps the current slice, the latest receipts, and the gates.

## Publication state

No preview after Preview.52 has an annotated tag or GitHub prerelease, although
Preview.53 through Preview.57 and Preview.63 have recorded Production receipts
from `main`. Two independent gates withhold publication:

```text
strict pool gate       the paced six-round release-profile probe must identify the
                       exact public version and pass; the newest recorded run
                       (Preview.57) reached Label 6/6 (four accepted, two
                       rejected) and returned accepted Inquiry answers 6/6, but
                       ended Repair in MODEL_TIMEOUT 6/6. Preview.53–56 also
                       failed it on Repair, Label, or Inquiry. Repair's
                       one-completable-attempt correction (2026-09-18) still
                       needs its own fresh release-profile receipt
session-sealing ring   issue #104: until the deployment owner installs
                       MATTER_PROVIDER_SESSION_KEYS and a fresh deployment reads
                       back, Model API reports available:false, both public
                       material surfaces read unavailable, and the strict
                       material-user-provider checker fails by design
```

Open operational issues that no source receipt can close: #104 (session ring),
#52 (the managed pool stalls from the deployed region), #34 and #68
(distributed rate, spend, alert, access-review, and rollback controls), and #63
(steady-state 2,000-node fold/focus cost). A healthy deployment, local
qualification, or a user's own provider key substitutes for none of them.

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
  FX-off structural paper ruling and one passage-local control fog carrying AI and − / +
  local Point-and-Talk UI with one strict whole-node text-swap/2 turn and exact pointer Undo
  browser-native live voice admission (no fixture voice on the public origin)
  deterministic navigation labels, with an independently gated managed proposal
  immediate transcript admission, with local repair rules and an independently gated managed proposal
  lightweight Ask Matter boundary, with its server-side answer adapter independently gated
  public Elastic and Text Swap surfaces supplied only by a verified user Model API lease
  no managed material-transformation adapter in the current deployment profile
```

## Current material-provider gate — 2026-09-25

The source configuration is a **GO** for the `material-user-provider` profile:
Elastic and Text Swap have separate public product gates, while
`MATTER_TRANSFORM_ADAPTER` and `MATTER_TEXT_SWAP_ADAPTER` remain `off`. A valid
sealed Model API lease may provide the request-local candidate for either
surface. No lease means no candidate; the route cannot borrow Matter's managed
pool or interpret the presence of a credential as authorization for a closed
surface.

Health must report both `transformTurn` and `textSwap` as
`user-configurable`. That state verifies product authorization plus the sealed
provider-session capability. It does not verify a saved credential, provider
reachability, answer quality, or managed promotion. The deployment checker now
defaults to this profile. `browser-preview` and `elastic-live` remain historical
profile readers and do not certify the current source shape.

Managed Elastic and managed Text Swap remain **NO-GO**. Each still needs its own
frozen corpus, paid evidence, distributed abuse and spend controls, strict
origin turn, and rollback receipt before its adapter may change to `live`.

The exact local Preview.61 candidate passed `npm run check`: 154 Node boundary
tests, 326 Markdown files, the 549-file / 8-layer architecture gate, 2,868
Vitest cases with five explicit skips, type generation, TypeScript,
zero-warning lint, the production build, and the runtime-artifact budget. Its
complete Chromium matrix then passed 175 cases with 15 capability-gated skips
and no retries. The functional matrix now runs serially because two and three
browsers repeatedly starved one shared Next development server; focused
concurrency, admission, and rate-limit proofs remain separate. Test-only
handoffs now bind the real CSS transition, response gate, and remounted DOM
owner instead of relying on sleeps. This remains local candidate evidence: it
does not prove a provider answer, a GitHub deployment, or production identity.

## Wiki automation verifier gate — 2026-09-27

The current source candidate is a bounded local automation slice, not a memory
layer. Schema V6 keeps canonical-term and alias-relation evidence in separate
bounded ledgers, binds automatic term evidence to a versioned producer family,
and migrates older producer-less evidence into zero authority. Automatic
collection observes only successful human material admission. Spoken fitting
may use the raw admitted transcript, while collection sees only the validated
committed material; generated and protected text cannot teach either ledger.

Two independent default-on local preferences pause real collection or the
currently released fitting path. They do not qualify a producer, delete
evidence, or widen scope. Six controlled-harness identities remain in the
offline qualification catalog; the narrower product runtime allow-list contains
two term producers and only the bounded Latin internal-edit producer. Every
identity binds exact producer, resource, and manifest-owned corpus digests.
`npm run qualify:wiki` re-executes
positive, adversarial, ambiguity, locale-isolation, protected, generated,
capacity, and performance cases. The derived automatic reservoir and fitting
indexes are bounded at 512 targets and 1,000 qualification lookups; the separate
human-confirmed dictionary admits at most 5,000 entries, while the wider
15,000-row structural ceiling remains recovery-only for formerly valid states.
The same command separately replays the production scoring policy across
activation, competition, decay, term collection, non-human exclusion, and
qualified projection, binding its constants, sources, qualification catalog,
corpus, and outputs to a compact release receipt.

The released fitting boundary is one internal ASCII edit with canonical no-op,
collision, locale, scope, protected-literal, and evidence gates. Exact Double
Metaphone, exact tone-bearing Mandarin pinyin, and `an`/`ang`, `en`/`eng`, and
`in`/`ing` final-pair producers remain qualification-only because a transcript
alone cannot disambiguate otherwise valid homophones. A canonical word added in
settings still does not invent a relation by itself. Recognizer phrase bias,
Wiki prompt injection, runtime network lookup, broader regional fuzzy rules,
hidden retrieval, and Material Undo coupling remain **NO-GO**.

The exact local Preview.63 candidate passed `npm run check`: 155 Node boundary
tests, 326 Markdown files, the 576-file / 8-layer architecture gate, type
generation, TypeScript, zero-warning lint, the production build, and the
runtime-artifact budget. Its focused Chromium Wiki matrix passed 4/4 cases,
including manual authority, spoken fixture admission, persistence/reload,
mobile touch sizing, and medium layout. An independent verifier found no P0 or
P1 blocker. The final PR #122 head then passed CI run `36334852074`; exact
merged-main CI run `36335534841` passed 155 Node boundary tests, 3,002 Vitest
cases with four explicit skips, all type/build/artifact gates, and 176 Chromium
cases. Production deployment `6695177071` and the public-origin
`browser-preview` readback passed for that exact source. Local qualification is
capability evidence and this is a deployed-source receipt, not authorization
for immutable publication or broader model authority.

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

The local release suite also sets the independent transform and Text Swap
adapters to their closed synthetic fixtures. The dedicated public configuration
opens both product surfaces and explicitly sets both managed adapters to `off`.
A verified request-local Model API lease may supply either route; without one,
the route has no candidate and cannot fall back to fixture prose or borrow the
already-live label/repair/inquiry pool. Browser fixture receipts prove
interaction and mutation boundaries only; they are not provider-quality proof.

`GET /matter/api/health` reports this boundary for the default mount. A
dedicated-domain deployment with an empty `MATTER_BASE_PATH` reports the same
probe at `/api/health`. It is a no-store capability probe, not an uptime or
dependency monitor.

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

- `POST /api/turn` (`transform/2`, Elastic) has its strict fixture browser
  receipt through release, one atomic replacement, Undo, Redo, and reload.
  Since 2026-09-25 it is a public product surface that only a verified user
  Model API lease can supply, and that path stays unavailable in Production
  until issue #104 closes. The fixture receipt does not promote a model:
  Matter's managed adapter stays `off` until it has a versioned multilingual
  acceptance corpus covering both single-segment and contiguous multi-segment
  ranges, a distributed rate rule, a hard spend ceiling, and a digest-bound
  deployed-origin receipt.
- `POST /api/text-swap` (`text-swap/2`, Point and Talk) is a separately gated
  public product surface under the same user-lease rule; its gate never follows
  Elastic's, and a closed surface never uses a lease. Its managed adapter stays
  `off` with no promotion owner. Promoting it would need its own multilingual
  paraphrase corpus, human review, rate/spend controls, and deployed-origin
  promotion procedure as a separate freeze.
- `POST /api/inquiry` validates a bounded selection-or-tree question; a live
  adapter is enabled only by server environment and otherwise returns an honest
  unavailable result. No server memory adapter is connected; each answer is
  bounded to the submitted selection or virtual material tree.
- Inquiry has same-origin, per-instance burst, and concurrency guards. The
  owning Vercel project must retain a distributed
  Firewall rate rule and a provider spend ceiling; serverless instances do not
  share the in-memory limiter.
- ZIP export and same-document restore are implemented; a foreign tree id is
  rejected before persistence until an active-document pointer exists.
  Directory export is not implemented and is intentionally outside this
  preview.
- Storage-full material remains in memory and now has a narrow-screen path to
  export and retry. This is not a multi-document UI.
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
