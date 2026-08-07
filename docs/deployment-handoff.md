# Matter deployment handoff

Status: **partial — source preview is ready; production promotion is deliberately blocked.**

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
- `POST /api/turn` is intentionally not deployed. The material-transform loop
  needs the separately tracked translator work before it can become live.

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

The three model gates are independent. To reduce exposure during rollout, enable
only labels first, then repair, then inquiry. A missing or failing pool remains
safe: labels stay deterministic, repair admits the words as heard, and inquiry
states that it is unavailable.

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

## Promotion procedure

Preview.11 is intentionally Vercel-ignored. Do not remove that guard merely to
test a secret. First configure the controls above, then create a fresh reviewed
version and let its Vercel build run (or replace the exact-version
`ignoreCommand` only as part of that reviewed promotion commit).

After the first real deployment:

```bash
npm run check:deployment -- https://matter.ptoq.io
```

Manually verify, with a normal browser and no repository secrets:

- `https://matter.ptoq.io/` returns the root-seeded canvas and
  `https://matter.ptoq.io/matter` is 404;
- `/api/health` reports the deployed version, empty base path, and only truthful
  capability states;
- browser speech works where the browser provides it; unsupported speech stays
  on-device or reports a truthful limitation;
- labels can improve, transcript repair falls back verbatim, and Ask Matter
  answers only from the submitted lasso passages or bounded tree context;
- no provider identity or response error leaks into the page; and
- rate limits, spend alarms, and an unavailable-provider fallback are observed
  once on the real origin.

Rollback is a Vercel deployment rollback plus disabling the affected scenario
gate; rotate a credential if there is any possibility it reached logs or a
client. Do not treat a model failure as a reason to persist a chat transcript
or to bypass the scenario adjudicator.

## Next development work

- Issue #34: deployment controls and a real-origin receipt.
- Issue #12: the frozen `/api/turn` translator and generated-text bound; this
  is the missing material-transform path, not a configuration change.
- Issue #8: complete the active-document pointer/recovery boundary before
  promising multi-document persistence beyond the current local home document.

Validation: local `npm run check` and full Chromium E2E must pass before every
source preview; after a Vercel promotion, add `npm run check:deployment` and the
manual real-origin receipt above.

Risks: browser speech availability varies by browser/vendor; serverless
in-memory governors do not replace edge rate limits; archive imports intentionally
begin a new undo journal; and no existing browser can reconstruct command history
that predates journal storage.

Next: the permissions holder rotates and installs the server secrets, completes
the rate/spend controls in issue #34, and promotes only a newly reviewed version.
