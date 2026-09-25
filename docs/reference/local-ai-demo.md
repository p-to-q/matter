# Local AI demonstration

This note defines a maintainer-only localhost boundary. It exists to prove that
Matter's real UI and server workflows can be demonstrated without confusing a
configured pool, a deterministic fixture, and a production promotion receipt.
It grants no public deployment authority.

## Start boundary

`npm run dev:ai` reads the gitignored `.env.local`, validates exactly one model
pool namespace and its station declarations, and binds Next to
`127.0.0.1:3000`. It rejects incomplete stations, unsafe non-HTTPS remote URLs,
ambiguous pool namespaces, malformed thinking declarations, and privileged or
invalid ports. No credential, endpoint, model name, prompt, or answer is logged.
Starting the process and reading health make zero completion calls.

The default profile is intentionally hybrid:

| Product surface | Default localhost owner | What it proves |
| --- | --- | --- |
| Voice | browser speech when supported; otherwise pinned local Whisper fallback | UI admission can be exercised; browser/OS permission and speech-service behavior still require browser proof |
| Transcript Repair | configured live pool after admitted speech | provider result may improve the deterministic floor |
| Thought Label | frozen fixture | opening the material does not create paid background traffic |
| Inquiry | configured live pool after Ask | bounded, non-mutating answer workflow |
| Point Talk / Text Swap | configured live pool after explicit rewrite | whole-node direction, strict plan, commit, and Undo path |
| Elastic Language | frozen fixture | exact segment, degree, strict plan, commit, and Undo path |

`--live-label` and `--live-transform` are explicit local evaluation switches.
The launcher prints `authority=local-demo; productionGo=false`; neither switch
changes `vercel.json`, a release gate, or a paid evaluation plan. Opening the
page can send visible material only when live labels were explicitly requested.
Using Repair, Inquiry, Point Talk, or live Elastic sends the material necessary
for that action to the configured provider pool. Browser-managed speech may use
the browser or operating system's speech service; Matter's server does not
receive raw audio.

## UI exercise

- **Voice:** use the microphone in the tool rail. A successful recording first
  becomes material; Repair may then replace only that admitted transcript under
  its short lease. This is also where browser permission, device, Stop, Retry,
  Dismiss, and error/retry focus recovery are proved.
- **Inquiry:** open Ask Matter, ask one short question, and verify that failure
  restores the exact draft while success adds one visible, non-material answer.
  The answer cannot resume as a chat, though its bounded completed record may be
  retained locally.
- **Point Talk / Text Swap:** hover or focus a material on desktop, or select it
  once on touch, then choose the AI rewrite action. The current presenter owns
  the whole node; a successful change must remain one pointer-undoable tree
  mutation.
- **Elastic Language:** the default fixture is deliberately exact. On the seed
  root, lasso the first punctuation-delimited passage
  `我们怀念的也许不是一个真实存在过的过去`, then move either grip to degree `0.5`.
  Release to settle that degree, then tap inside the shaped address to confirm;
  release alone must send no request.
  The same seeded passage also has one frozen `0.61` receipt for the default
  desktop drag distance. A different passage or degree is expected to fail
  closed and preserve the material. `--live-transform` evaluates the provider
  instead of this fixture.
- **Thought Label** is automatic rather than a separate visible action. It is a
  fixture by default so merely opening the page cannot spend provider capacity.

Transcript Repair has no document-derived term field. The working-context
projection remains below the admission boundary, so held-aside material cannot
cross into repair through a stale render effect.

## Probe boundary

`npm run probe:local-ai` is dry by default and sends zero requests. The explicit
`npm run probe:local-ai -- --execute` form accepts only a plain-HTTP loopback
Matter origin. It first checks the expected app version, base path, protocol,
surface schema, and no-store health response, then sends at most one synthetic
request through each server route for Repair, Label, Inquiry, Transform, and
Text Swap. One route may attempt multiple configured provider candidates within
its fixed scenario deadline.

The probe uses fresh synthetic label material to defeat the process cache. It
enforces each browser response-byte bound, fatal UTF-8 decoding, JSON and
no-store responses, existing strict Repair/Label/Inquiry classifiers, and exact
Transform/Text Swap plan identity and range echo. It reports only surface,
configured state, closed outcome/reason, status, and duration. It never prints
the synthetic answer, provider identity, endpoint, model, or credential.

This is a route/provider smoke, not a UI test, exact dirty-source identity, model
quality evaluation, microphone permission check, or deployment receipt. Voice
must be exercised in a real browser. Point Talk and Elastic must separately
prove the visible action, current-basis precommit check, tree-engine mutation,
and pointer Undo.

When a strict material route reports `MODEL_REJECTED`, the public response stays
content-zero. The launcher terminal's `matter.material-turn` observation names
the exact closed policy reason for maintainers without logging the answer or
expanding the public protocol.

## Promotion boundary

A localhost model success does not promote either generative material route.
Elastic still needs the versioned five-locale corpus expanded to contiguous
multi-segment selections, digest-authorized paid runs, independent review,
distributed rate and spend controls, deployed-origin evidence, and a gate-off
rollback receipt. Point Talk is a current local workflow, but its live Text Swap
provider still requires its own promotion decision. Public health remains a
configuration receipt only.
