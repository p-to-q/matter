# Matter deployment handoff

Status: **live — the root-seeded browser preview is deployed and all three model
gates are open on `matter.ptoq.io`. The abuse and spend controls in issue #34
are still outstanding, and that is now a live exposure rather than a plan.**

The deployment owner enabled labels, transcript repair, and inquiry together on
2026-08-08, ahead of the staged order below, so that the deployed origin matches
a local `.env.local`. What that decision leaves open is recorded honestly here
rather than removed: the in-process governors are per-instance only, no
distributed rate rule exists, and no provider spend ceiling is configured. Until
issue #34 closes, the practical ceiling on a runaway cost is the provider
account itself.

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

Set these as encrypted **server** environment variables in the Matter Vercel
project. Apply them to Production and, if a shared preview needs real answers,
Preview. Do not place keys in `vercel.json`, repository files, browser-visible
`NEXT_PUBLIC_*` variables, GitHub Actions secrets echoed into logs, or issue
comments.

```text
MATTER_LABEL_POOL=aiping
MATTER_LABEL_AIPING_BASE_URL=https://aiping.cn/api/v1
MATTER_LABEL_AIPING_API_KEY=<newly rotated secret>
MATTER_LABEL_AIPING_MODELS=Qwen3.5-Flash,GLM-4.7-Flash
MATTER_LABEL_AIPING_ENABLE_THINKING=false

MATTER_LABEL_ADAPTER=live
MATTER_REPAIR_ADAPTER=live
MATTER_INQUIRY_ADAPTER=live
```

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

Before any production promotion, complete GitHub issue #34:

1. Add distributed rate rules for `/api/label`, `/api/repair`, and
   `/api/inquiry`. The in-process governors are intentionally only local to a
   Vercel instance; they are not a distributed abuse control.
2. Set a provider spend cap and alerts, then verify the provider account has no
   unrestricted key shared with another product.
3. Restrict Vercel project access to the deployment owner(s), keep production
   environment values separate from preview values, and rotate any key ever
   exposed outside the encrypted Vercel store.
4. Keep production protection, HTTPS, the existing security headers, and the
   dedicated-domain routing intact. No provider name, raw audio, material text,
   or key belongs in routine logs.

## Browser-preview deployment

The current `main` build may deploy the root-seeded browser experience without a
model credential. This is an intentional safe mode, not a fixture: browser
speech and local material work, labels retain their deterministic floor,
transcript repair falls back to heard text, and Ask Matter reports an unavailable
answer model. Elastic and Text Swap likewise fail closed without fixture prose;
their successful local browser receipts do not imply that either live model gate
is open. The public UI must not imply that an answer model is live.

## Live-model promotion procedure

Do not add a provider secret merely to test the UI. First configure the controls
above, then create a fresh reviewed version and let its Vercel build run.

After each browser-preview deployment, verify the dedicated origin. `--wait=120`
retries the same bounded receipt during the normal edge propagation window; it
does not relax a failing version or surface check.

```bash
npm run check:deployment -- https://matter.ptoq.io --wait=120
```

That command defaults to `--profile=browser-preview`: it requires both
`transformTurn` and `textSwap` to report `unavailable`. A reviewed promotion
uses the explicit profile below only after the corpus, distributed rate rule,
owner-approved spend cap/alerts, isolated credential, and rollback receipts
exist:

```bash
npm run check:deployment -- https://matter.ptoq.io --profile=material-live --wait=120
```

The live profile proves that both independent adapters are configured; it does
not call the provider and is never a substitute for one successful strict
synthetic turn through each deployed route.

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
candidate station/model, prompt and corpus versions, complete corpus content,
axes, repeats, and aggregate call/output-token ceilings. Any mismatch stops
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
  --expected-version=0.2.0-preview.37
```

That command only prints the planned 1+1 smoke receipt. Do not add the execution
flags until both health surfaces are live and the external controls are already
proved. The promotion profile cannot be resized: it schedules 50+50 distinct
strict synthetic turns with one shared eight-second starting interval. Its
versioned digest binds ten exact-segment inputs per locale, all twelve semantic
strata, three Transform amounts, and three Text Swap direction families. Any
model rejection fails promotion, and timeout/unavailability may occupy at most
one of fifty per surface.

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
  truthful `transformTurn` and `textSwap` capability states;
- browser speech works where the browser provides it; unsupported speech stays
  on-device or reports a truthful limitation;
- labels retain their deterministic floor, transcript repair falls back
  verbatim, and Ask Matter truthfully reports an unavailable model until the
  live-model procedure has been completed;
- no provider identity or response error leaks into the page; and
- the unavailable-provider fallback is observed once on the real origin.

After live-model promotion, repeat the origin check with a bounded selected
passage and a bounded virtual-tree inquiry. Verify rate limits and spend alarms
there, rather than treating the credential-free browser preview as model proof.

Rollback is a Vercel deployment rollback plus disabling the affected scenario
gate; rotate a credential if there is any possibility it reached logs or a
client. Do not treat a model failure as a reason to persist a chat transcript
or to bypass the scenario adjudicator.

## Next development work

- Issue #34: deployment controls and a real-origin receipt.
- Issue #12: the fixture `/api/turn` and `/api/text-swap` browser loops are now
  proven; run their independent multilingual live evaluations, then enable each
  only after the shared distributed controls and its own real-origin receipt
  exist.
- Issue #8: complete the active-document pointer/recovery boundary before
  promising multi-document persistence beyond the current local home document.

Validation: local `npm run check` and full Chromium E2E must pass before every
source preview; after a Vercel promotion, add the explicit
`--profile=material-live` deployment check and the manual real-origin receipt
above. With the gates open, `/api/health` reports `thoughtLabel`,
`transcriptRepair`, `inquiry`, `transformTurn`, and `textSwap` as `available`;
that word means a pool is configured, never that a relay answered.

Risks: browser speech availability varies by browser/vendor; serverless
in-memory governors do not replace edge rate limits; archive imports intentionally
begin a new undo journal; and no existing browser can reconstruct command history
that predates journal storage.

Next: the permissions holder rotates and installs the server secrets, completes
the rate/spend controls in issue #34, and promotes only a newly reviewed version.
