# Preview deployment-owner handoff

Status: Preview.53 is the current deployed public-origin source through the
automatic GitHub-linked Production path. Topic `884dfc0` passed CI and automatic
Preview; merged `main` `7cd3bb6` passed CI, automatic Production deployment
`6255484923`, and the no-store public version check. Its GitHub prerelease and
annotated tag are withheld because the exact strict pool release probe failed;
the latest immutable publication remains Preview.52 at `6a4931b`. The
repository maintainer pushes only GitHub and observes the linked deployment;
the deployment owner retains Vercel configuration and credential authority.
The candidate preserves the current process-local admission perimeter and live
label, transcript-repair, and Ask Matter gates. Elastic and Text Swap remain
unavailable. This is an operator checklist, not a place to record token values.

The source ceilings below are active only per warm instance and are not evidence
of distributed edge control.

## Owner boundary

The deployment owner controls the Matter Vercel project. The provider owner
controls the provider account, its budget, and its alerts. Both must retain
their evidence outside this repository. Do not place credentials, recordings,
transcripts, prompts, or response text in this file, a GitHub issue, or a build
log.

The repository owner has directed one Preview.53 prerelease after the exact
candidate passes repository, browser, GitHub CI, and the automatically triggered
deployment gates. This is fresh Preview.53-only authority; it does not extend
the historical Preview.49 authorization or permit the repository maintainer to
run a manual Vercel command or edit Vercel configuration. The automatic
promotion does not prove that external controls exist. Issues #34 and #68
remain open; label, repair, inquiry, and browser/local voice stay as configured,
while Elastic and Text Swap remain unavailable. The source admission ceilings
below are per warm instance only.

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

### How to know it is fixed

`npm run probe:pool -- https://matter.ptoq.io --rounds=6 --pace=65 --profile=release --expected-version=0.2.0-preview.53`
reports `pool-healthy` and `surface-usable`, with repair, label, and Inquiry
producing a real accepted result on every call. Healthy
inquiry latency has been under two
seconds, so a correct result is fast, not marginal. Pacing beyond the local
health window reduces one attribution ambiguity; it does not prove requests hit
the same instance or that provider intermittence is gone.

The exact Preview.47 strict-pool release probe failed after its successful
deployment and public version check. Health and deployment success did not
substitute for it, so publication was withheld. Preview.48 must produce its own
closed-count release receipt; neither the failure nor any later success may be
borrowed across source versions, and one successful run is not evidence that
the intermittency is gone. The same rule now binds Preview.53: its release probe
must identify Preview.53 and cannot borrow Preview.48's later receipt.

Preview.53's first exact six-round release probe failed after successful CI,
automatic Preview and Production, and a one-probe public version match. Repair
reached a model 0/6, label 1/6, and Inquiry 1/6; the remaining calls ended in
their bounded timeout or unavailable behavior. This is external runtime
evidence, not a reason to alter the selected-material implementation or enable
a hidden fallback. Publication remains withheld until a fresh closed-count
Preview.53 probe reports both `pool-healthy` and `surface-usable`.

After a full recovery window, the one permitted repeat also failed: repair,
label, and Inquiry each reached a model 0/6, and the probe classified the pool
as down. Do not keep retrying this release in a tight loop. A later owner-run
probe must be a new closed-count observation and must pass all three surfaces
before the immutable tag or GitHub prerelease is created.

### Incident-time source boundary

At the time of the incident the working tree carried uncommitted prompt work
with no evaluation receipt, so it was not a valid vehicle for an environment
repair. That historical constraint does not evaluate the later Preview.48
candidate; every release still requires its own exact source and behavior
receipts.

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
   Repeat `npm run check:deployment -- https://matter.ptoq.io --wait=120` for
   that final SHA and retain its no-store version/public-alias receipt before
   tagging. The paid pool and browser behaviour proofs need not repeat because
   no source behaviour may change in this step.
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
4. Do not set `MATTER_TRANSFORM_ADAPTER=live` or `MATTER_TEXT_SWAP_ADAPTER=live`.
   Their product and promotion gates remain closed.

## External controls required before expanding model authority

1. Add distributed edge rate rules for `/api/label`, `/api/repair`,
   `/api/inquiry`, and `/api/transcribe`. After the next-source candidate is
   deployed, its source-side ceilings are a per-warm-instance first line of
   defence, not a distributed promise:

   | Route | Requests per identity / minute | Concurrent requests per instance |
   | --- | ---: | ---: |
   | `/api/label` | 48 | 6 |
   | `/api/repair` | 12 | 4 |
   | `/api/inquiry` | 12 | 4 |
   | `/api/transcribe` | 12 | 3 |

   Record the edge identity, window, burst and concurrency semantics explicitly;
   do not infer a global limit by multiplying these numbers by an unknown
   serverless replica count.
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

If a live surface must be stopped, disable its corresponding server gate first,
then roll back the Vercel deployment. Rotate the provider key whenever exposure
is plausible. Do not persist a failed model response, and do not weaken the
server adjudicator to restore availability.

## Completion receipt

Close [issue #68](https://github.com/p-to-q/matter/issues/68) only when the
deployment owner has supplied the distributed-rate, provider-cap, alert,
access-review and rollback receipts. This does not authorize Elastic; it only
closes the common operational boundary recorded in issue #34.
