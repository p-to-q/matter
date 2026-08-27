# Matter deployment handoff

Status: **live — the root-seeded browser preview is deployed and all three model
gates are open on `matter.ptoq.io`. The required abuse- and spend-control
receipts in issue #34 are still outstanding, so this remains an unverified live
exposure rather than a completed release boundary.**

The deployment owner enabled labels, transcript repair, and inquiry together on
2026-08-08, ahead of the staged order below, so that the deployed origin matches
a local `.env.local`. What that decision leaves open is recorded honestly here
rather than removed: the in-process governors are per-instance only, and this
handoff has no owner-supplied receipt for the required distributed rate rules or
provider spend ceiling. Until issue #34 closes, release work must treat those
controls as missing rather than infer them from a healthy origin.

For Preview.39, the deployment owner explicitly directed one production
promotion before those external receipts are supplied, while delegating the
vendor-side configuration to a separate operator. This is a one-release risk
acceptance, not evidence that the controls exist: it preserves the three
already-live gates only, keeps Elastic and Text Swap unavailable, and does not
close issue #34. The `v0.2.0-preview.39` tag is deployed on
`matter.ptoq.io`; the no-store health receipt was checked on 2026-08-22.

For Preview.40, the owner has again explicitly directed one production
promotion before those external receipts are supplied. This is a new,
Preview.40-only risk acceptance; Preview.39's exception did not carry forward
automatically. It preserves label, repair, and inquiry, keeps Elastic and Text
Swap unavailable, and leaves issues #34 and #68 open. The shared source
admission perimeter is only a per-warm-instance first line. It is not evidence
of a distributed rate limit, provider spend cap, alert delivery, or an
operator-owned rollback receipt.

Preview.40 completed the later source-to-production boundary: final review fixes
merged as `af4bcb9`, reached Production, and were published as the annotated
immutable `v0.2.0-preview.40` tag. That release supersedes Preview.39's
`c347f78` deployment for the shared four-route process-local admission perimeter
and corrected public discovery copy. The unresolved operational controls below
remain exceptions, not evidence that distributed limits, spend caps, alerts, or
rollback ownership now exist.

For Preview.41, the owner directed one further production promotion after the
voice, locale, camera-authority, and public-boundary hardening. This is a fresh
Preview.41-only risk acceptance, not an extension of either earlier exception.
The versioned topic head `7fb7774` passed exact Preview deployment; PR #71
merged it as `6ecbabc`, exact Production deployment `6050614354` succeeded,
and `matter.ptoq.io` matched `0.2.0-preview.41` on the first public-origin
probe. It preserves the same live gates, keeps Elastic and Text Swap
unavailable, and leaves issues #34 and #68 open. The immutable tag and GitHub
prerelease must point to the final release-record Production SHA.

For Preview.42, the owner explicitly directed the Slate / Bone brand, ambient
stacking, discovery, and deployed-receipt work through main. This is a fresh
Preview.42-only risk acceptance; it preserves label, repair, inquiry, and voice,
keeps Elastic and Text Swap unavailable, and leaves issues #34 and #68 open.
Topic `233614e` passed Preview deployment `6053631689`; PR #73 merged it as
`738d077` and Production deployment `6053671842` exposed the approved icon
bytes. The public edge's bounded icon cache differed from the local Next header,
so topic `0eeb289` made that observed contract strict and passed Preview
`6053732823`. PR #74 merged it as `776b003`; exact Production deployment
`6053793739`, the public-origin receipt, and a real-browser metadata and ambient
stacking walk all succeeded. The immutable tag and GitHub prerelease must point
to the final release-record Production SHA.

For Preview.43, the owner explicitly directed the passage-local Point-and-Talk,
shared working-context control, responsive index seam, and return-centring work
through main. This is a fresh Preview.43-only risk acceptance. It preserves the
existing live label, repair, inquiry, and voice gates; the public profile keeps
Elastic and Text Swap providers unavailable and leaves issues #34 and #68 open.
Source `d75f38a` passed CI run `32742182110`, exact Production deployment
`6065375891` succeeded, and `matter.ptoq.io` matched `0.2.0-preview.43` after
two bounded probes. The immutable tag and GitHub prerelease point to the final
release-record Production SHA after that record-only main settles.

For Preview.44, the owner explicitly directed the bounded Point-and-Talk
geometry refinement through main and into one prerelease. This is a fresh
Preview.44-only risk acceptance, not an extension of Preview.43. It preserves
the existing live label, repair, inquiry, and voice gates; Elastic and Text Swap
providers remain unavailable, while issues #34 and #68 remain open. Exact
source `1847530` passed the complete local source and browser gates. Proof
record `54a258f` then passed CI run `32761201277`, exact Production deployment
`6068655811`, and the public no-store `0.2.0-preview.44` health boundary. The
immutable tag and GitHub prerelease point to the final release-record Production
SHA after that record-only main settles.

For Preview.45, the owner explicitly directed the material-index selection
grammar correction through main and into one prerelease. This is a fresh
Preview.45-only risk acceptance, not an extension of Preview.44. It preserves
the existing live label, repair, inquiry, and voice gates; Elastic and Text Swap
providers remain unavailable, while issues #34 and #68 remain open. The change
is confined to the client-side directory projection and its proof: Select keeps
the current tree's bounded relationship guides behind its checkboxes, while
Search and Archive stay unlined. It does not change material, persistence,
history, protocol, provider, or model authority. Source `b0cbad6` passed CI run
`32784091448`, exact Vercel deployment `7YhTAqHt7hUg5m6YVsjAEvXS45zY`, and
the first public-origin `0.2.0-preview.45` probe. The immutable tag and GitHub
prerelease point to the final record-only main after that record settles.

For Preview.46, the owner has explicitly directed one further production
promotion and prerelease after the model-harness hardening passes the complete
source, browser, Preview, and public-origin proof. This is a fresh
Preview.46-only risk acceptance, not a continuing waiver. It preserves the
existing live label, repair, inquiry, and voice gates; Elastic and Text Swap
remain unavailable, while issues #34 and #68 remain open. The change may
improve prompt standing, completion settlement, anonymous telemetry, and late
transport cleanup, but it is not evidence of a distributed rate limit,
provider spend cap, alert delivery, or operator-owned rollback. Exact commit,
CI, deployment, probe, and release identifiers stay pending until observed.

This handoff is for the person who controls the Matter Vercel project and the
model-provider account. It contains no credential values. A credential that was
shared outside the deployment secret store must be rotated before use.

## What is already ready

- The dedicated-domain build owns `/`, uses the root-only seed, and keeps each
  visitor's later material in that browser's IndexedDB.
- Browser Web Speech is the first voice path. When unsupported, the browser may
  run the existing lazy on-device Whisper fallback; raw audio is not sent to a
  Matter model provider.
- Labels, transcript repair, and Ask Matter already share one server-only,
  OpenAI-compatible model pool. Each scenario has its own gate and an honest
  failure floor. There is no client-side provider key and no hidden retrieval.
- The pool accepts Qwen3.5-Flash first and GLM-4.7-Flash as the configured
  fallback. Prompt construction, bounds, adjudication, cancellation, cooldown,
  and load shedding stay in the existing harness — do not duplicate them in a
  route or Vercel Function.
- `POST /api/turn` now exists as a fixture-gated material-transform vertical
  slice with a browser receipt through atomic replacement, Undo/Redo, and
  reload. `POST /api/text-swap` has the same proof behind its own independent
  gate. Both remain unavailable for a live provider until their separate
  multilingual acceptance corpora, the same distributed rate/spend controls,
  and deployed-origin proof required by other model routes are in place.

The relevant boundaries are [`reference/prompt-harness.md`](reference/prompt-harness.md),
[`reference/voice-input.md`](reference/voice-input.md),
[`architecture.md`](architecture.md), and GitHub issue #34.

## Required Vercel configuration

Set the `MATTER_MODEL_*` station values as encrypted **server** environment
variables in the Matter Vercel project. Apply them to Production and, if a
shared preview needs real answers, Preview. Do not place keys in `vercel.json`,
repository files, browser-visible `NEXT_PUBLIC_*` variables, GitHub Actions
secrets echoed into logs, or issue comments. The three adapter switches shown
below are non-secret reviewed source configuration already declared by
`vercel.json`; they are listed beside the pool only to make the complete runtime
shape legible.

```text
MATTER_MODEL_POOL=aiping
MATTER_MODEL_AIPING_BASE_URL=https://aiping.cn/api/v1
MATTER_MODEL_AIPING_API_KEY=<newly rotated secret>
MATTER_MODEL_AIPING_MODELS=Qwen3.5-Flash,GLM-4.7-Flash
MATTER_MODEL_AIPING_ENABLE_THINKING=false

MATTER_LABEL_ADAPTER=live
MATTER_REPAIR_ADAPTER=live
MATTER_INQUIRY_ADAPTER=live
```

`MATTER_MODEL_*` is the canonical scenario-neutral namespace for a new or
deliberately migrated deployment. The currently deployed `MATTER_LABEL_*`
namespace remains a complete compatibility fallback; it does not make the pool
label-specific. Migrate all station variables and the pool variable in one
reviewed environment change. Never leave both `MATTER_MODEL_POOL` and
`MATTER_LABEL_POOL` non-empty: Matter deliberately reports the pool unavailable
instead of merging two candidate orders or guessing which credentials own live
traffic. A Preview/Production environment may keep the complete legacy namespace
until that atomic migration is scheduled; no key rotation is required merely by
this source release.

External configuration owns only the station order, each OpenAI-compatible base
URL and key, the ordered model names within that station, and the optional
station-level `ENABLE_THINKING=true|false` transport flag. Scenario gates remain
independent (`LABEL`, `REPAIR`, `INQUIRY`, `TRANSFORM`, `TEXT_SWAP`), but every
live gate resolves the same candidate registry. Environment values cannot change
prompt policy, temperature zero, response-byte ceilings, scenario deadlines,
adjudication, automatic-retry policy, or a material action. Those remain reviewed
source contracts; separate per-scenario pools would recreate five drifting
provider integrations and are intentionally unsupported.

### Model-path budgets and fallback boundary

These are hard ownership boundaries, not claimed production SLOs:

| Surface | Scenario/provider | Route/browser | Safe floor | Shared answer cache |
| --- | ---: | ---: | --- | --- |
| thought label | 12 s | 13 s / 13 s | deterministic label already visible | 256 accepted labels, 10 min, complete normalized-input fingerprint + prompt version |
| transcript repair | 6–8 s | 8.8 s / 8.8 s | deterministic repair rules | none |
| Ask Matter | 16 s | 20 s / 20 s | restore the submitted question | none |
| Elastic | 12 s | 14 s / 16 s | exact passage unchanged | none |
| provider-gated Point-and-Talk / Text Swap | 12 s | 14 s / 16 s | exact passage unchanged | none |
| server transcription | 30 s | 30 s / 35 s | browser-native or local capability remains separate | none |

The platform allowances remain 20 s for labels, 15 s for repair, 25 s for
inquiry/Elastic/Text Swap, and 35 s for server transcription. Candidate fallback
happens only inside one scenario call: it never resamples an adjudicator
rejection and never retries a completed browser action. A candidate that ignores
cancellation still loses its bounded attempt when the timer expires, preserving
the remaining deadline for the next configured candidate.

The label cache stores only an adjudicated label behind two 32-bit FNV-style
digests plus the exact serialized byte length; this is a non-cryptographic cache
key, not an integrity boundary. It stores no node text, prompt, provider,
identity, or credential, and a browser repeats current-material validation. Its
complete-input-fingerprint single flight is the only cross-request model
coalescing. Audio,
transcript, repair, question, inquiry answer, lineage, Elastic output, and Text
Swap output are never cached or coalesced. Every model/audio browser-to-Matter
POST and the Matter-to-provider POST explicitly uses no-store transport and
refuses redirects.

A duration budget is not evidence that a relay meets it. Production p50/p95,
timeout/unavailability rate, cold-start share, and fallback mix still require
privacy-safe aggregate receipts from the deployed origin. Routine evidence may
carry only surface, closed outcome/reason, duration and byte/length buckets; it
must not carry prompt, material, audio, provider identity, endpoint, key, request
identity, or response text. The distributed admission, spend ceiling and alert
ownership for those SLO measurements remains the external issue #34 boundary.

### Content-zero model performance receipt — current contract

Preview.39 introduced this receipt; Preview.46 extends its closed schema with
completion-settlement counters. This table is the complete current contract,
not a retroactive claim about older log lines. Health proves the
deployed version and configured capability only; the deployment operator must
inspect the retained server-log receipt before claiming that this event was
emitted. A production model-scenario invocation with a non-null adapter writes
at most one `matter.scenario-performance` JSON line. Candidate attempts are
folded into that terminal line in memory; they never create their own logs or
network calls. A cache hit, a surface with no adapter, and a caller cancellation
do not emit this event. Source sampling is intentionally off:
p50/p95 and fallback mix cannot be reconstructed honestly after selective
success sampling. The volume ceiling is therefore one such scalar line per
scenario terminal, not one line per candidate, response chunk, label cache read,
or unrelated route request. Governor-shed `busy` and cooldown `unavailable`
terminals also produce that single event even though no candidate starts; their
zero attempt count is the useful fact.

The event and field set is closed:

| Field | Allowed values / cardinality | Meaning and privacy boundary |
| --- | --- | --- |
| `scenario` | five scenario ids, plus logger-only `unknown` | Which reviewed Matter surface ran; never a tool, node, tree, request, user, or provider id. |
| `outcome` | `answered`, `unavailable`, `timeout`, `busy`, `rejected`, plus logger-only `unknown` | Terminal harness classification. `rejected` means the provider answered and adjudication refused it; it is not a provider failure. |
| `elapsedMs` | integer `0..120000` | Harness wall time from admission checks through terminal settlement. It is a numeric measurement, never a metric label. |
| `candidateTelemetry` | `pool` or `unreported` | `pool` proves the shared pool supplied anonymous attempt facts; `unreported` makes no claim for a fixture or custom adapter. |
| `candidateAttempts` | integer `0..255` | Anonymous candidate attempts that settled before the scenario terminal. |
| `candidateTimeouts` | integer `0..255` | Those attempts that exhausted their pool-owned attempt boundary. |
| `candidateFailures` | integer `0..255` | Fast transport, HTTP, body-bound, decoding, or envelope failures; no body or status is logged. |
| `candidateTruncations` | integer `0..255` | Attempts whose explicit terminator says the returned text was incomplete. |
| `candidateRefusals` | integer `0..255` | Attempts ending in a guardrail/refusal, tool/continuation state, or unknown explicit terminator. A conflict containing a known truncation and otherwise complete metadata is counted as truncation. |
| `candidateUnknownTerminators` | integer `0..255` | Modifier count for explicit stop vocabulary this build does not recognize; it accompanies a refused attempt. |
| `candidateMissingTerminators` | integer `0..255` | Modifier count for accepted compatibility responses that omitted stop metadata; it accompanies an answered attempt. |

This table is the complete schema only for `matter.scenario-performance`.
Elastic and provider-gated Text Swap retain the separate existing
`matter.material-turn` route receipt with closed locale, amount, length and byte
buckets. The one-event harness ceiling therefore does not claim that a material
turn produces only one application log line. `candidateTelemetry: "pool"` is
the only value that proves the shared provider pool supplied attempt facts;
`"unreported"` may describe a fixture or another injected adapter and makes no
provider claim.

The logger reconstructs this allowlist rather than serializing a caller-owned
object, so extra fields cannot ride into a line. Material, prompt, selected
text, answer, transcript, audio, locale, byte content, node/tree/request id,
IP, provider/station/model/endpoint/key, and error text are impossible receipt
fields. A metrics sink failure is swallowed outside scenario settlement.

Attribution is deliberately narrow. The four completion fields describe only
the pool's closed classification; they do not identify a relay or prove why it
produced that state. `candidateUnknownTerminators` and
`candidateMissingTerminators` modify an already counted attempt rather than
adding another one. `timeout` proves the scenario deadline;
`candidateTimeouts` counts only pool attempts whose own boundary settled before
that terminal, so it may be zero when the parent deadline won the race. `busy`
proves process-local governor shedding, not edge saturation. `unavailable` may
mean scenario cooldown, an exhausted/failing adapter, or an internal
compile/adjudication failure; anonymous candidate counts distinguish some, not
all, of those cases. `answered` proves server
adjudication accepted the answer, not that the browser later committed it.
Provider cold/warm is omitted: neither first use in a serverless instance nor a
slow first attempt proves provider cache state. Platform cold-start evidence
must come from the platform itself and be correlated only in aggregate.

After promotion, Matter retains none of these receipts. They exist only in the
deployment's ordinary server-log retention and add no telemetry request, queue,
database, or dependency. They can support instance-side scenario latency and
fallback-mix analysis. They cannot measure browser-to-origin latency, edge
queueing, dropped instances, or a deployed-origin p95, and therefore do not
replace issue #34's distributed controls, externally retained aggregate
receipt, or alert owner.

`vercel.json` already fixes the non-secret product build shape:

```text
MATTER_BASE_PATH=
MATTER_INITIAL_DOCUMENT=root
MATTER_PUBLIC_ORIGIN=https://matter.ptoq.io
MATTER_TRANSCRIPTION_ADAPTER=browser
NEXT_PUBLIC_MATTER_BROWSER_SPEECH_ENABLED=true
NEXT_PUBLIC_MATTER_AUDIO_UPLOAD_ENABLED=true
NEXT_PUBLIC_MATTER_LOCAL_TRANSCRIPTION_ENABLED=true
```

Those values live in `build.env`, because `next.config.ts` and the prerendered
metadata read them while the bundle is produced. The subset the server re-reads
per request — the base path, the public origin, and the transcription adapter —
is repeated in `env`, so the deployed health probe reports what the build
actually shipped. Do not move them back into `buildCommand`: Vercel rejects a
`buildCommand` over 256 characters during schema validation, before any build
runs, and that failure produces no build log. `npm test` now enforces the bound,
both shapes, and the absence of any credential-shaped entry.

The three model gates are independent, but the current launch configuration
declares all three non-secret `live` switches in `vercel.json`. The encrypted
project environment remains the only place for the pool's endpoint and key.
`npm run check:vercel` and `npm run check:deployment` now fail if a deployment
leaves labels, repair, or inquiry unavailable. A missing or failing pool remains
safe at any time: labels stay deterministic, repair keeps its local rule floor,
and inquiry states that it is unavailable, so turning one gate off remains a
complete rollback for that surface.

## Runtime delivery and cache boundary — Preview.39

The Preview.39 release keeps the product root as a static prerender, and Vercel
serves its content-hashed Next assets from the deployment cache. The
stable-name poster, videos, and logo keep the Preview.38-equivalent `public,
max-age=14400, must-revalidate` browser policy; they are never `immutable` or
given a separate `s-maxage`. This makes the observed four-hour behavior explicit
and portable without claiming a new cache hit or letting a changed stable-name
asset remain stale indefinitely.

The local speech worker, 24 MiB-ceiling ONNX WASM, and pinned Whisper model are
absent from the initial page graph. The worker code is reached only when browser
speech is unavailable; model weights are reached only after the person starts a
voice turn. Transformers.js may keep the pinned revision in disposable browser
Cache Storage. It never stores audio or a transcript there. Every Matter API,
browser model client, and outbound provider POST remains `no-store`; no CDN or
shared application cache may hold material or model answers. The only model
proposal cache is the existing bounded, process-local, read-time-revalidated
thought-label cache.

Preview.40 carries a deliberately narrow local-speech exception. Web Speech
remains the preferred path. When it is unavailable, a person may start the
experimental local Whisper fallback, which then lazily downloads about 151.5
MiB of pinned fp32 model weights in addition to tokenizer, WASM, and runtime
overhead. It returns final text only, has no live partial transcript, and may be
slow or fail on a weak network or low-performance device; the person can cancel
it. The release proof covers one Chromium synthetic-audio path only. It does not
claim Safari, mobile, weak-network, quantized-model, or real multi-segment
acoustic-pause readiness. Audio remains on the device, but the browser contacts
Hugging Face to fetch the fixed model revision. Do not present this exception
as a default-path performance improvement.

`npm run build` in this release ends with the runtime-artifact budget
gate. Preview.38 did not carry that post-build gate. The gate proves the
static shell, initial transfer ceiling, lazy model split, content-hashed
font/WASM output, a complete `public/` budget plus the narrower visual-media
budget, absence of production source maps, and clean root/server Next traces.
CI restores `.next/cache` under lockfile and source keys
to reduce repeated compiler work; that cache is disposable and never deployed.
The deployment probe checks the real poster response policy with a header-only
request along with the existing release receipt. See
[`reference/runtime-cache-and-delivery.md`](reference/runtime-cache-and-delivery.md)
for the complete matrix, weak-network behavior, cold-start posture, budgets,
and content-free operational measurements.

`available` on the health probe means a pool is configured, never that a relay
is reachable from the deployed region — the probe must not open a provider
connection to answer a machine. The two are not the same fact, and they have
already disagreed in production: a fully `available` receipt sat above a pool
whose every call timed out. So a promotion is only finished when one live call
per surface has been made against the deployed origin, each with the origin
header the route requires:

- `/api/label` returns `source` `model` rather than `provisional`;
- `/api/repair` returns `source` `model` rather than `verbatim`, sending an
  utterance that plainly needs punctuation so a correct verbatim answer cannot
  be mistaken for a dead relay;
- `/api/inquiry` returns `answered` rather than a 503.

A pool that has just started falling back also cools down for a minute at a
time, so re-probe after a pause before concluding that a relay is gone.

Because all three gates are part of this launch configuration, a credential-free
deployment of the dedicated origin is no longer a supported shape:
`check:deployment` fails on it by design. To stage the interface without a pool,
turn the gates off on that deployment and expect the check to report exactly
which surface is unavailable.

## Edge, spend, and access controls

The default production gate remains completion of GitHub issue #34:

1. Add distributed rate rules for `/api/label`, `/api/repair`, `/api/inquiry`,
   and `/api/transcribe`. The in-process governors are intentionally only local
   to a Vercel instance; they are not a distributed abuse control. The exact
   per-instance source ceilings and the operator warning against multiplying
   them by an unknown replica count live in
   [`deployment-owner-handoff.md`](deployment-owner-handoff.md#external-controls-required-before-expanding-model-authority).
2. Set a provider spend cap and alerts, then verify the provider account has no
   unrestricted key shared with another product.
3. Restrict Vercel project access to the deployment owner(s), keep production
   environment values separate from preview values, and rotate any key ever
   exposed outside the encrypted Vercel store.
4. Keep production protection, HTTPS, the existing security headers, and the
   dedicated-domain routing intact. No provider name, raw audio, material text,
   or key belongs in routine logs.

## Browser-preview deployment

The public production `browser-preview` profile is not credential-free. Labels,
transcript repair, and Ask Matter retain their three existing live gates and
server-only pool; only Elastic and the Point-and-Talk Text Swap provider remain
unavailable. The profile name describes the material-model boundary, not the
state of every model-backed surface. A private credential-free staging build may
turn the three existing gates off and use their deterministic, verbatim, or
stated-unavailable floors, but it does not satisfy the current production
deployment check.

## Deployment and future Elastic promotion

Do not add or rotate a provider secret merely to test the UI. Before changing a
live gate, first configure the controls above, then create a fresh reviewed
version and let its Vercel build run.

After each browser-preview deployment, verify the dedicated origin. `--wait=120`
retries the same bounded receipt during the normal edge propagation window; it
does not relax a failing version or surface check.

```bash
npm run check:deployment -- https://matter.ptoq.io --wait=120
```

That command defaults to `--profile=browser-preview`: it requires both
`transformTurn` and `textSwap` to report `unavailable`. A reviewed Elastic
promotion uses the explicit profile below only after the Elastic corpus,
distributed rate rule, owner-approved spend cap/alerts, isolated credential,
and rollback receipts exist:

```bash
npm run check:deployment -- https://matter.ptoq.io --profile=elastic-live --wait=120
```

The live profile proves that Elastic is configured while the Point-and-Talk
Text Swap provider remains unavailable. It does not call the provider and is never a
substitute for one successful strict synthetic Elastic turn through the
deployed route. The superseded paired `material-live` profile is rejected so a
release cannot silently revive Text Swap.

Candidate quality and origin operation are deliberately separate. The language
evaluation defaults to an ordinary skipped test. First use its zero-call `plan`
mode for one scenario and one candidate ordinal:

```bash
MATTER_LANGUAGE_EVAL=1 \
MATTER_LANGUAGE_EVAL_MODE=plan \
MATTER_LANGUAGE_EVAL_SCENARIO=transform \
MATTER_LANGUAGE_EVAL_CANDIDATE_INDEX=1 \
npm run eval:language
```

This writes a private gitignored plan and prints only its path, digest, call
ceiling, and output-token ceiling. It does not print candidate station/model or
synthetic material. Inspect that private artifact and the external spend
controls, then run only with both values printed by that exact plan plus the
independent call confirmation:

```bash
MATTER_LANGUAGE_EVAL=1 \
MATTER_LANGUAGE_EVAL_MODE=run \
MATTER_LANGUAGE_EVAL_SCENARIO=transform \
MATTER_LANGUAGE_EVAL_CANDIDATE_INDEX=1 \
MATTER_LANGUAGE_EVAL_PLAN_FILE=tmp/material-language-eval/<plan>/plan.private.json \
MATTER_LANGUAGE_EVAL_PLAN_DIGEST=<exact-64-character-digest> \
MATTER_LANGUAGE_EVAL_CONFIRM_CALLS=360 \
npm run eval:language
```

The run reloads the plan and recomputes its digest from the current scenario,
candidate station/model/thinking mode and endpoint digest, prompt and corpus versions, exact
compiled prompts, deterministic adjudication and completion-policy identities,
pool limits, per-case budgets, complete corpus content, axes, repeats, and
aggregate call/output-token ceilings. Any mismatch stops
before an adapter exists. Run Text Swap separately with
`MATTER_LANGUAGE_EVAL_SCENARIO=text-swap`. Raw synthetic inputs/answers, the
private plan, and the two blinded review packets stay only below the gitignored
`tmp/material-language-eval/` directory. A missing or incomplete second review
can never pass; Text Swap remains calibration-only until its numeric promotion
thresholds are re-frozen from evidence.

The evaluator proves every selected passage is one exact production punctuation
segment and creates a running manifest plus empty safe/private journals before
the first provider call. Each paid result is durably appended before the next
call. An interrupted or unwritable run therefore remains `running` with its
completed samples. Scoring accepts only all 360 unique case/repeat receipts,
recomputes the metrics from that journal, and refuses a conflicting summary. It
also reconstructs the blinded review material from that same run's private
journal and verifies its source digest against the paid-plan digest, candidate,
prompt, and corpus metadata. A review key plus two packets copied together from
another run is therefore rejected even when both runs accepted the same number
of samples.
Corpus coverage also recomputes each selected passage's extended-grapheme count
and its locale-relative short/medium/long rank. Text Swap reviewers record
direction following separately, and the scored human summary reports useful and
follows-direction consensus by locale, direction family, and source-length
bucket. Elastic review does not require a direction judgement.

The deployed-origin sampler is also dry-run by default. It requires an explicit
origin and expected version; remote execution additionally requires an exact
`MATTER_SYNTHETIC_PROBE_ORIGIN`, `--execute`, and `--allow-remote`, while the
production domain requires its literal `--allow-production` confirmation. It
uses no browser material, cookies, recording, retry, trace, screenshot, or
video:

```bash
npm run probe:material-origin -- https://matter.ptoq.io \
  --expected-version=0.2.0-preview.41
```

That command only prints the historical paired 1+1 smoke plan. It is useful for
inspecting the retained tool, but it is not current Elastic release evidence and
must not be given execution flags on this release line. The retained paired
promotion profile cannot be resized: it schedules 50+50 distinct strict
synthetic turns with one shared eight-second starting interval. Its versioned
digest binds ten exact-segment inputs per locale, all twelve semantic strata,
three Transform amounts, and three Text Swap direction families. Any model
rejection fails that historical profile, and timeout/unavailability may occupy
at most one of fifty per surface.

Execution creates a running manifest and empty safe journal under the
gitignored `tmp/material-origin-probe/` directory before the health request.
Every sample receipt is durably appended before the following POST; a failed
append stops the run and no completed summary is written. A successful finish
adds a summary with origin, expected/observed deployed version, suite
version/digest, start/end time, expected/completed counts, and aggregate only.
These files contain no synthetic text or direction, lineage, returned plan,
tree/node/request id, IP, cookie, provider, or response text. An interrupted
`running` directory is evidence of an incomplete attempt, never promotion.
Admission or malformed-response fail-fast writes a partial `stopped` receipt;
only all planned calls can produce the `completed` summary.

Manually verify, with a normal browser and no repository secrets:

- `https://matter.ptoq.io/` returns the root-seeded canvas and
  `https://matter.ptoq.io/matter` is 404;
- `/api/health` reports the deployed version, empty base path, and separate
  truthful states: `thoughtLabel`, `transcriptRepair`, and `inquiry` are
  `available`, while `transformTurn` and `textSwap` are `unavailable`;
- browser speech works where the browser provides it; unsupported speech stays
  on-device or reports a truthful limitation;
- one bounded synthetic call per existing live surface proves the relay rather
  than merely its configuration: labels and repair report `model`, and inquiry
  reports `answered`; and
- no provider identity or response error leaks into the page. The deterministic,
  verbatim, and stated-unavailable floors remain rollback behavior, not the
  expected production receipt while those gates are live.

For any future Elastic promotion, repeat the origin check with one strict
synthetic selected passage after its own corpus and origin tooling are current.
Verify rate limits and spend alarms there, rather than treating the existing
browser-preview health receipt as Elastic model proof.

Rollback is a Vercel deployment rollback plus disabling the affected scenario
gate; rotate a credential if there is any possibility it reached logs or a
client. Do not treat a model failure as a reason to persist a chat transcript
or to bypass the scenario adjudicator.

## Next development work

- Issue #34: deployment controls and a real-origin receipt.
- Issue #12: the fixture `/api/turn` browser loop is proven; run its
  multilingual Elastic evaluation, then enable it only after the distributed
  controls and its own real-origin receipt exist. `/api/text-swap` remains a
  dormant, unavailable grammar with no first-release UI or promotion claim.
- Issue #8: complete the active-document pointer/recovery boundary before
  promising multi-document persistence beyond the current local home document.

Validation: local `npm run check` and full Chromium E2E must pass before every
source preview; after a browser-preview Vercel promotion, run the default
deployment check and the manual real-origin receipt above. Run the explicit
`--profile=elastic-live` check only for a reviewed Elastic promotion. With the
Elastic gate open, `/api/health` reports `thoughtLabel`,
`transcriptRepair`, `inquiry`, and `transformTurn` as `available`, while
`textSwap` remains `unavailable`; `available` means a pool is configured, never
that a relay answered.

The existing deployed-origin sampler still plans the historical paired Elastic
and Text Swap calls. Do not run it as current release evidence. Elastic live
promotion remains blocked until that tool has a transform-only, digest-bound
50-call profile; browser-preview promotion does not require or imply Elastic
live-provider proof.

Risks: browser speech availability varies by browser/vendor; serverless
in-memory governors do not replace edge rate limits; archive imports intentionally
begin a new undo journal; and no existing browser can reconstruct command history
that predates journal storage.

Next: the deployment owner supplies the distributed-rate and provider-spend
receipts required by issue #34, closes that blocker, and keeps the material
model gates unavailable until their separate promotion evidence is complete.
