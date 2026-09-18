# Preview deployment-owner handoff

Status: the public origin identifies itself as Preview.57 through the automatic
GitHub-linked Production path after PR #105 reached `main` at `2f85b94`.
Source, CI, deployment, and bounded public-origin identity proof are complete,
but immutable publication is withheld. The 2026-09-18 public receipt still
reports the Model API session surface as `available: false`. A newer strict
six-round managed-pool receipt reached the provider for Label 6/6 (four accepted
labels and two policy rejections) and returned accepted Inquiry answers 6/6,
but Repair used its deterministic floor after `MODEL_TIMEOUT` 6/6. Neither a
successful deployment nor provider reachability on the two non-Repair surfaces
substitutes for the failed Repair gate or the independent session gate. The
latest immutable publication remains Preview.52 at `6a4931b`.

The repository maintainer pushes GitHub source and observes the linked
deployment. The deployment owner retains Vercel environment and credential
authority; partial Cloudflare access does not confer that authority. The
missing Production sealing-ring action is tracked publicly in issue #104 with
only non-secret acceptance evidence. Do not work around that boundary by
deriving a ring from provider keys, copying a value through an issue, or running
an unowned manual deployment. This is an operator checklist, not a place to
record token values.

Preview.57 introduces an optional fixed-lifetime Model API lease while
preserving the same public gates. The source fails closed without
`MATTER_PROVIDER_SESSION_KEYS`: managed model calls
continue unchanged, while `GET /api/provider-session` reports
`available: false` and Test/Save/Remove actions remain unavailable while the
two fields stay editable. That is a safe deployment,
but it is not evidence that the requested Model API feature is available. The
deployment owner must generate and store the independent AES-256 key ring as
described in `deployment-handoff.md`; the repository maintainer is not
authorized to invent, derive, print, or install it. No provider key belongs in
Vercel configuration—the user's provider key exists only inside the encrypted
30-day lease created after an explicit verified save.

Preview.57 is the reviewed and deployed source. It changes no deployment
ownership or public Transform/Text Swap authority. Its safe fail-closed state
keeps the existing managed surfaces usable, but Model API availability still
requires the independent owner action above and one fresh deployment. After
that action, the repository-side deployment check and managed-pool probe below
must both pass against the exact public version before publication.

Exact Preview.56 source `e88d06c` passed 97 Node checks, 48-document link proof,
the 462-file seven-layer architecture gate, 2,224 Vitest cases with four
explicit skips, type generation, TypeScript, zero-warning lint, production
build, and runtime artifact inspection. Its formal production 2,000-node
receipt passed all three rounds with whole-session and measurement long-task
maxima of 69ms and 68ms, 4,474 DOM elements, and an initial runtime of
1,196,550 raw / 379,215 gzip bytes. A contended local Chromium sweep reported
three timing failures and each passed alone against the same artifact; both
final topic and merged-main CI then passed the complete browser suite. These
are source receipts, not substitutes for the public model-pool gate.

The source ceilings below are active only per warm instance and are not evidence
of distributed edge control.

## Owner boundary

The deployment owner controls the Matter Vercel project. The provider owner
controls the provider account, its budget, and its alerts. Both must retain
their evidence outside this repository. Do not place credentials, recordings,
transcripts, prompts, or response text in this file, a GitHub issue, or a build
log.

The repository owner has directed one Preview.57 prerelease after the exact
candidate passes repository, browser, GitHub CI, and the automatically triggered
deployment gates. This is fresh Preview.57-only authority; it does not extend
the Preview.56 direction or permit the repository maintainer to run a manual
Vercel command or edit Vercel configuration. The automatic promotion does not
prove that external controls or the new session-sealing ring exist. Issues #34
and #68 remain open; label, repair, inquiry, and browser/local voice stay as
configured, while Elastic and Text Swap remain unavailable. The source
admission ceilings below are per warm instance only.

## Resolved-by-itself incident — inquiry reached no model on Production

Observed 2026-08-28 against `https://matter.ptoq.io` running `0.2.0-preview.45`,
by `npm run probe:pool` across two runs, the second paced 70s apart so no sample
sat inside a cooldown this probe caused:

```text
label    4/4 reached a model    0.76-1.1s
repair   3/4 reached a model    0.99-1.1s   (one TRANSPORT unreachable)
inquiry  0/8 reached a model    16.08-16.17s, MODEL_TIMEOUT every time
```

Every inquiry call spent its complete 16s budget and returned 503. A person saw
Ask Matter fail after about sixteen seconds; label and repair failed into their
deterministic floors without saying anything, which is why the product read as
"the AI stopped working" rather than as one surface being down.

**It then recovered with no change on our side.** About fifteen minutes later
the same probe reported `pool-healthy`, inquiry reaching a model 3/3 in
854-1723ms — in line with the 915ms recorded at Preview.23. No deploy, no
environment edit, and no code change happened between the two runs.

That recovery is the most informative result. A static missing environment
variable does not heal itself, so a dropped `ENABLE_THINKING` cannot be the whole
story. The event is consistent with transient provider, intermediary, or
warm-instance pool degradation; the origin probe cannot distinguish those
owners. It matches the intermittence this repository recorded at Preview.23 and
Preview.26 in `release-readiness.md` without proving the same cause.

**Narrowed, with evidence.** A source regression is unlikely: between
`v0.2.0-preview.40` and the deployed commit, `model-pool.ts`,
`inquiry-provider.ts`, `inquiry-harness.ts`, `inquiry-route.ts`, and
`harness.ts` each have zero commits. It is not missing configuration: the health
route reports `inquiry: available`, which means an adapter resolved, not that a
relay was reachable. Repair's larger input prompt answering in one second makes
input size alone unlikely; it does not rule out output ceiling, model reasoning,
candidate order, or process-local state.

**What the failure correlated with was output length.** Label asks for tens of
tokens and answers; repair asks for about 124 and answers; inquiry asks for 720
and never returns. The configured surfaces produced short answers in those
samples; the probe did not establish candidate or warm-instance affinity.

This repository already anticipated that shape. `docs/changes.md`, 2026-08-07:
low-latency inquiry and naming "should not pay for hidden reasoning", and the
entry explicitly forecloses "relying on a provider's changing default thinking
mode". If the station serving Production is not being sent
`enable_thinking: false`, a model whose upstream default has since turned
thinking on will spend inquiry's larger budget reasoning and return nothing
inside the attempt window, while repair's tight ceiling forces it to stop early
and still answer.

### Deployment owner — check in this order

1. In the Matter Vercel project, Production scope, confirm **exactly one** of
   `MATTER_MODEL_POOL` and `MATTER_LABEL_POOL` is non-empty. Both non-empty is
   refused by design and would take the pool down entirely, so this is a
   check, not the expected cause.
2. In whichever namespace is the live one, confirm every station has its
   matching `..._ENABLE_THINKING=false`. The variable is namespaced with the
   pool, so `MATTER_LABEL_AIPING_ENABLE_THINKING` and
   `MATTER_MODEL_AIPING_ENABLE_THINKING` are different variables and a partial
   migration silently drops it. This is a worthwhile hardening check, not the
   established incident cause. It needs no source change, only a redeploy if the
   environment is corrected.
3. Confirm the station's `..._MODELS` names still exist at that gateway. A
   renamed or retired model is a fast 4xx, not a hang, so this is unlikely to
   be the cause here, but it is cheap to confirm.

### Provider owner — check in this order

1. Whether the account is rate-limited or over budget. A gateway that queues
   instead of returning 429 presents exactly as this hang.
2. Whether the default thinking mode for the configured models changed
   upstream. Run the same request twice against the station, once with
   `"max_tokens": 124` and once with `"max_tokens": 720`, then once more at 720
   with `"enable_thinking": false`. If the third is fast, item 2 above is the
   fix. Keep the key and the responses out of this repository.

### The durable gap this exposed

Nobody knew. The product lost its one interactive model surface for at least ten
minutes and the detection path was a person opening the site. Health does not
help here and says so: it reports configured capability, not whether a relay
answered. Repair and label make it worse by design — their floors are correct,
so a pool outage is invisible on those surfaces by construction.

This is direct evidence for the alert-delivery control already tracked as open
under issue #34, and it should be cited there rather than filed again. What is
missing is not a dashboard: it is a scheduled `probe:pool` against Production
whose failure reaches a person, and a recorded expectation for inquiry latency
so that "slow" is distinguishable from "down" without reading this file. Until
that exists, every occurrence of this will be found the same way.

### Current Preview.57 publication gate

After the exact Preview.57 source has passed topic and merged-main CI and its
automatic Preview and Production deployments, run:

`npm run check:deployment -- https://matter.ptoq.io --wait=120 --require-provider-session`

The opt-in check performs an anonymous same-origin
`GET https://matter.ptoq.io/api/provider-session` in addition to the ordinary
version and public-surface checks. Its no-store strict status must identify
protocol `4` and return the exact
empty shape: `available: true`, `credentialPresent: false`,
`resetRequired: false`, `credentialId: null`, `endpoint: null`, and
`expiresAt: null` without an operator cookie. It performs no provider request. If it reports
`available: false`, the source remains safe but the new Model API feature is not
deployable; do not publish a Preview.57 prerelease and do not derive a sealing
key from another deployment secret.

Then run:

`npm run probe:pool -- https://matter.ptoq.io --rounds=6 --pace=65 --profile=release --expected-version=0.2.0-preview.57`

Publication is allowed only when that exact paced run reports `pool-healthy`
and Inquiry produces an accepted answer on every call. Repair and Label must
reach a provider on every call, but a semantic rejection may settle their
deterministic floor without vetoing publication; their quality is governed by
the separately versioned offline corpus, not one stochastic live canary.
Provider-session availability does not substitute for the managed pool gate,
and a healthy managed pool does not substitute for availability of the feature
introduced in this candidate. A paid user key is not a release fixture and must
never be placed in a probe, log, issue, or this handoff.

### Preview.56 publication gate

After the exact Preview.56 source has passed merged-main CI, its automatic
Production deployment, and the bounded public-origin version check, run:

`npm run probe:pool -- https://matter.ptoq.io --rounds=6 --pace=65 --profile=release --expected-version=0.2.0-preview.56`

Publication is allowed only when that one exact, paced run identifies
Preview.56 and reports both `pool-healthy` and `surface-usable`, with repair,
label, and Inquiry producing a real accepted result on every call. A partial
result, an older successful receipt, or a successful deployment is not a
substitute. If it fails, Preview.56 source may remain deployed but its annotated
tag and GitHub prerelease stay withheld. Healthy Inquiry latency has been under
two seconds, so a correct result is fast, not marginal. Pacing beyond the local
health window reduces one attribution ambiguity; it does not prove requests hit
the same instance or that provider intermittence is gone.

### Preview.56 withheld receipt

The exact Preview.56 run failed after topic and merged-main CI, automatic
Preview and Production, and the bounded public-origin identity check all
passed. Repair produced an accepted model result 5/6; one call used the
deterministic floor after `MODEL_TIMEOUT`, at 1,729 / 2,046 / 7,725ms minimum,
median, and maximum latency. Label reached a provider completion 5/6 but
produced an accepted model name only 1/6: four completions were refused as
`MODEL_REJECTED` and one used the deterministic floor after `MODEL_TIMEOUT`, at
1,198 / 1,448 / 13,163ms. Inquiry produced an accepted model answer 6/6 at
1,203 / 1,656 / 2,024ms. The probe reported `pool-degraded` and
`surface-degraded`.

This is a failed release gate, not a deployment or fail-closed-product failure:
Preview.56 remains online, deterministic Repair and Label floors remained
available, and no annotated tag or GitHub prerelease was created. The result is
also not authority to weaken label adjudication. The public response and
production scalar receipt intentionally contain neither model text nor user
material, and do not distinguish `invalid-label` from
`not-better-than-provisional`; a prompt or policy change therefore needs its own
synthetic corpus evidence rather than inference from this aggregate run. Do not
turn an immediate retry into an apparent recovery receipt.

### Preview.55 withheld receipt

The exact Preview.55 run failed after topic CI and Preview, merged-main CI,
automatic Production, and the bounded public-origin identity check all passed.
Repair reached a model 6/6 in 1,609 / 2,140 / 2,570ms minimum, median, and
maximum latency. Label reached a model 0/6: every call ended in `MODEL_TIMEOUT`
and used the deterministic floor, at 12,383 / 12,423 / 12,452ms. Inquiry reached
a model 1/6; the other five calls ended with four `MODEL_TIMEOUT` and one
`MODEL_UNAVAILABLE`, at 2,163 / 16,393 / 16,524ms. The harness reported
`surface-specific` and `surface-degraded`. This is a failed release gate, not a
deployment failure: Preview.55 remains online, but no annotated tag or GitHub
prerelease may be created from this receipt. A later publication attempt needs
one fresh closed-count run after a full recovery window, not an immediate retry.

### Preview.54 withheld receipt

The exact Preview.54 run failed after the source, CI, automatic deployment, and
public-origin checks passed. Repair reached a model 0/6: five calls ended in
`MODEL_TIMEOUT` and one in `TRANSPORT`, with 375 / 7,402 / 7,544ms minimum,
median, and maximum latency. Label reached a model 0/6: five calls ended in
`MODEL_TIMEOUT` and one in `MODEL_UNAVAILABLE`, with 12,394 / 12,500 / 13,082ms
latency. Inquiry reached a model 6/6 in 1,220 / 1,491 / 3,418ms. The harness
reported `surface-specific` and `surface-degraded`. That is a failed release
gate, not a deployment failure: Preview.54 may remain online, but no annotated
tag or GitHub prerelease may be created from this receipt. Do not convert a
tight retry into apparent evidence. Only one fresh closed-count observation
after a full recovery window could qualify while Preview.54 remains the exact
deployed source.

### Historical withheld publications

The exact Preview.47 strict-pool release probe failed after its successful
deployment and public version check. Health and deployment success did not
substitute for it, so publication was withheld. Preview.48 must produce its own
closed-count release receipt; neither the failure nor any later success may be
borrowed across source versions, and one successful run is not evidence that
the intermittency is gone. The same rule bound Preview.53: its release probe had
to identify Preview.53 and could not borrow Preview.48's later receipt.

Preview.53's first exact six-round release probe failed after successful CI,
automatic Preview and Production, and a one-probe public version match. Repair
reached a model 0/6, label 1/6, and Inquiry 1/6; the remaining calls ended in
their bounded timeout or unavailable behavior. This is external runtime
evidence, not a reason to alter the selected-material implementation or enable
a hidden fallback. Preview.53 publication remains permanently withheld;
Preview.54 requires its own fresh closed-count evidence under the current gate
above.

After a full recovery window, the one permitted repeat also failed: repair,
label, and Inquiry each reached a model 0/6, and the probe classified the pool
as down. Do not keep retrying this release in a tight loop. A later owner-run
probe would have needed to be a new closed-count observation passing all three
surfaces; that historical publication is no longer eligible.

### Incident-time source boundary

At the time of the incident the working tree carried uncommitted prompt work
with no evaluation receipt, so it was not a valid vehicle for an environment
repair. That historical constraint does not evaluate the later Preview.48
candidate; every release still requires its own exact source and behavior
receipts.

## Known qualitative observation — browser gesture verification

A prior local browser session reported that "sidebar scroll must not undo the
canvas gesture" lost drawing state once. No reproducible trace or completed
JSONL receipt survived that run, and a later verification was interrupted.
This is therefore a test lead, not evidence of a cold-start, deployment, or
provider-pool defect: the gesture and sidebar state are client-owned and the
test performs no model call. It must be investigated only if the exact browser
case reproduces, using its pointer/state trace; it must not be routed to a
deployment or provider owner on the basis of the earlier observation.

## Historical Preview.42 release and authorization

The owner has directed one Preview.42 production promotion after the current
review and hardening work. This is a fresh, one-preview exception: it keeps the
same label, repair, inquiry, and browser/local-voice gates, keeps Elastic and
Text Swap unavailable, and leaves issues #34 and #68 open. It is not permission
to treat the process-local source perimeter as distributed abuse control or to
claim a provider spend cap, alert delivery, or rollback receipt.

The versioned topic head `233614e` passed GitHub CI and exact Preview deployment
`6053631689`. PR #73 merged it as `738d077`; exact Production deployment
`6053671842` exposed the approved icon bytes. The public cache receipt correction
`0eeb289` passed Preview deployment `6053732823`; PR #74 merged it as `776b003`,
exact Production deployment `6053793739` succeeded, and the final public origin
matched `0.2.0-preview.42` after one probe. A real browser also adopted all five
metadata links and kept one foreground owner through dark language/inquiry and
light settings transitions. The annotated immutable `v0.2.0-preview.42` tag
must peel to the final release-record Production SHA; the remote tag and GitHub
prerelease are the authority for that last identity check.

## Exact GitHub-triggered publication and deployment sequence

Every candidate records one version in `package.json` and both root package
entries in `package-lock.json`. GitHub is the repository maintainer's only
delivery control; Vercel's Git integration observes it automatically.

1. Confirm no `.env*`, recording, transcript, private evaluation artifact, or
   ignored `tmp/` content is staged. Run `git diff --check`, `npm run check`, and
   `npm run test:e2e` on the exact versioned candidate.
2. Push the `codex/` topic, open a pull request, and wait for GitHub CI on that
   exact head and for the automatically created protected Vercel Preview tied to
   the same SHA. Browser proof must address that source. Never print or pass a
   protection-bypass secret through a command or log.
3. Reconfirm the pull request head, merge without another source change, and
   read back the exact remote `main` SHA. Wait for the Vercel Production status
   automatically created for that SHA; do not substitute an ad-hoc CLI deploy.
   Run the bounded public check and strict pool probe below without changing
   configuration or handling credentials.
4. On a proof-only topic, record the exact source, CI, automatic Preview and
   Production, public check, browser, and pool receipts. Merge it and require
   its exact final `main` SHA to finish the same automatic Production path.
   Repeat
   `npm run check:deployment -- https://matter.ptoq.io --wait=120 --require-provider-session`
   for that final SHA and retain its no-store version/public-alias/session
   receipt before tagging. The paid pool and browser behaviour proofs need not
   repeat because no source behaviour may change in this step.
5. Require Immutable Releases to report enabled, create and push the annotated
   version tag on that final deployed proof SHA, verify its remote peel, then
   create, inspect, publish, and verify the GitHub prerelease. npm publication
   remains unauthorized.

The GitHub deployment API is the neutral SHA-to-Vercel receipt when dashboard
access is unavailable: list deployments filtered by the exact SHA, require one
successful `Preview` record before merge and one successful `Production`
record after merge, then read each status URL. A generic green commit status
without its environment and SHA is insufficient.

## Vercel configuration

1. In the Matter Vercel project, use encrypted **server** environment variables
   only for the complete `MATTER_MODEL_*` station: pool order, endpoint, key,
   and model order. The three existing non-secret live switches are reviewed
   source configuration in `vercel.json`: `MATTER_LABEL_ADAPTER=live`,
   `MATTER_REPAIR_ADAPTER=live`, and `MATTER_INQUIRY_ADAPTER=live`.
2. Apply the same reviewed secret set only to Production. A Preview environment
   may use real answers only when its access and provider budget are separately
   approved. Never put provider values in `NEXT_PUBLIC_*`, `vercel.json`, or a
   GitHub secret echoed into output.
3. Keep the repository-owned non-secret build shape unchanged: root mount,
   browser speech plus local fallback enabled, and `MATTER_TRANSCRIPTION_ADAPTER=browser`.
   The authoritative variable names and migration rule are in
   [`deployment-handoff.md`](deployment-handoff.md#required-vercel-configuration).
4. Install an independent, rotatable `MATTER_PROVIDER_SESSION_KEYS` ring before
   claiming that Model API is available. Generate and retain it only in the
   encrypted Vercel server environment; never derive it from a provider key or
   another deployment secret. The exact format and rotation window are in
   [`deployment-handoff.md`](deployment-handoff.md#required-vercel-configuration).
5. Do not set `MATTER_TRANSFORM_ADAPTER=live` or `MATTER_TEXT_SWAP_ADAPTER=live`.
   Their product and promotion gates remain closed.

## External controls required before expanding model authority

1. Add distributed edge rate rules for `/api/label`, `/api/repair`,
   `/api/inquiry`, `/api/transcribe`, and the external-probe lane at
   `POST /api/provider-session`. After the next-source candidate is deployed,
   its source-side ceilings are a per-warm-instance first line of defence, not a
   distributed promise:

   | Route | Requests per identity / minute | Concurrent requests per instance |
   | --- | ---: | ---: |
   | `/api/label` | 48 | 6 |
   | `/api/repair` | 12 | 4 |
   | `/api/inquiry` | 12 | 4 |
   | `/api/transcribe` | 12 | 3 |
   | `POST /api/provider-session` | 8 | 3 |

   Record the edge identity, window, burst and concurrency semantics explicitly;
   do not infer a global limit by multiplying these numbers by an unknown
   serverless replica count. Keep `GET /api/provider-session` as a local,
   no-provider status read and keep same-origin `DELETE` revocation outside any
   expensive-probe queue so a person can always remove a saved credential. That
   DELETE must preserve both `Set-Cookie` headers through the edge: bearer expiry
   and the independent removal-generation rotation. Dropping or coalescing either
   header breaks the cross-tab late-save ordering proof.
2. Set a provider spend cap and delivery channel for budget alerts. Limit the
   key to this deployment and rotate any key that may have left the encrypted
   deployment store.
3. Record the responsible operator, the configured limits, alert delivery, and
   a rollback contact in the deployment system or private runbook. The public
   issue may link to that receipt but must not contain its sensitive contents.

## Verification and rollback

After a reviewed deployment of the next exact source SHA, run:

```bash
npm run check:deployment -- https://matter.ptoq.io --wait=120
```

The expected browser-preview health shape is: label, repair, inquiry and voice
admission available; transform and Text Swap unavailable. This only proves
configuration. Follow the existing private synthetic-turn procedure before
claiming provider-answer evidence.

For Preview.57 and later candidates that claim Model API, add
`--require-provider-session`. The stricter receipt proves only that the session
sealing boundary is installed and anonymously empty; it deliberately does not
spend a provider request or expose any key.

If a live surface must be stopped, disable its corresponding server gate first,
then roll back the Vercel deployment. Rotate the provider key whenever exposure
is plausible. Do not persist a failed model response, and do not weaken the
server adjudicator to restore availability.

## Completion receipt

Close [issue #68](https://github.com/p-to-q/matter/issues/68) only when the
deployment owner has supplied the distributed-rate, provider-cap, alert,
access-review and rollback receipts. This does not authorize Elastic; it only
closes the common operational boundary recorded in issue #34.
