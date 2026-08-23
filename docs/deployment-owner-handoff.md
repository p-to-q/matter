# Preview deployment-owner handoff

Status: Preview.42 source work merged through PR #73 as `738d077`; its bounded
public-cache receipt merged through PR #74 as `776b003`. Exact Production
deployment `6053793739` completed and `matter.ptoq.io` matched
`0.2.0-preview.42`, including the approved favicon bytes and metadata contract,
on the first final public-origin probe. Its final release-record commit is the
target of the annotated immutable `v0.2.0-preview.42` tag. The release preserves
the four-route process-local admission perimeter, adds the reviewed Slate / Bone
identity and ambient stacking correction, and keeps labels, transcript repair,
and Ask Matter live. Elastic and Text Swap remain unavailable. This is an
operator checklist, not a place to record token values.

The source ceilings below are active only per warm instance and are not evidence
of distributed edge control.

## Owner boundary

The deployment owner controls the Matter Vercel project. The provider owner
controls the provider account, its budget, and its alerts. Both must retain
their evidence outside this repository. Do not place credentials, recordings,
transcripts, prompts, or response text in this file, a GitHub issue, or a build
log.

The owner has directed one Preview.42 production promotion while the external
receipts remain outstanding. Treat that direction as a Preview.42-only risk
acceptance, not a continuing waiver and not evidence that the controls exist.
Issues #34 and #68 remain open; label, repair, inquiry, and browser/local voice
stay as configured, while Elastic and Text Swap remain unavailable. The source
admission ceilings below are per warm instance only. Before any later release,
obtain a fresh owner decision or the distributed-rate, provider-spend, alert,
and rollback receipts.

## Preview.42 release and authorization

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

## Exact source-preview and production sequence

Matter deploys through the repository's Vercel Git integration. A pushed topic
branch creates a protected Vercel Preview deployment; updating `main` creates a
Production deployment. This checkout has no committed or local `.vercel`
project binding, so a maintainer must not substitute an ad-hoc `vercel` CLI
deployment for that auditable path or risk selecting another project or
environment.

The completed Preview.42 candidate records `0.2.0-preview.42` in `package.json`
and both root package entries in `package-lock.json`. Its health route, Preview,
and Production agree on that identity. The immutable tag must agree before this
release is complete; future candidates must make the same source-to-receipt
comparison before promotion.

The release sequence is atomic at one candidate commit:

1. Create a `codex/` topic branch before committing the reviewed working tree.
   Confirm no `.env*`, recording, transcript, private evaluation artifact, or
   ignored `tmp/` content is staged. Run `git diff --check`, `npm run check`, and
   `npm run test:e2e` on the exact versioned candidate.
2. Push the topic branch and open a pull request. Wait for GitHub CI and the
   Vercel Preview deployment for the same commit SHA. Vercel Preview URLs are
   deployment-protected and return an SSO redirect to anonymous probes, so use
   the Vercel deployment success receipt plus an authenticated browser walk;
   never print or pass a protection-bypass secret through a command or log.
3. Reconfirm the pull request head SHA, then merge without allowing another
   source change into the release boundary. Read back remote `main` and use its
   resulting exact SHA as the production identity; do not assume a merge method
   preserves the topic-branch SHA.
4. Wait for the Vercel **Production** deployment recorded for that exact `main`
   SHA, then run `npm run check:deployment -- https://matter.ptoq.io --wait=120`.
   Complete the manual voice and model-surface receipts below before saying the
   candidate is live.
5. Only after the production receipt succeeds, require the repository's
   Immutable Releases setting to report `enabled: true`. Create the annotated
   tag for the exact candidate version on that production SHA, push it, and
   verify the remote annotated tag peels to the same SHA. Create the prerelease
   as a draft, publish it only after its metadata is complete, then require
   `gh release verify <candidate-tag>` to validate GitHub's release
   attestation. Immutable Releases prevents the published tag from being moved
   or deleted while the release exists. npm publication remains unauthorized.

The GitHub deployment API is the neutral SHA-to-Vercel receipt when dashboard
access is unavailable: list deployments filtered by the exact SHA, require one
successful `Preview` record before merge and one successful `Production`
record after merge, then read each deployment's status URL. A generic green
commit status without its environment and SHA is insufficient.

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
