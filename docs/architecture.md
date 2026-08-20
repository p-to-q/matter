# Architecture

## Runtime paths

Human material enters without a generative model call:

```text
selected visible node (or document root) + microphone
  → browser-native Web Speech API (preferred)
  → POST /api/transcribe when an explicit server adapter exists
  → transcript
  → formatting-only human insert command → tree engine → first paint
  ↘ detachable repair port: ordered locale rules → optional POST /api/repair
  → two-paint + 650ms visibility gate + admissible candidate
  → opaque store lease + exact node/document revalidation
  → optional repair command → tree engine
  → transient material-settle receipt → canonical text renders once
```

Repair is faithful intent recovery at the hearing boundary, not generative
thinking. Admission never waits for it: the
formatting floor is durable before repair computes, and a correction cannot
commit until that floor has crossed two paint opportunities and remained
visible for 650ms. The browser port computes a pure TypeScript floor first: it
protects literals, applies locale-specific disfluency cleanup, classifies only
high-confidence spoken number/date/time/version/unit spans, renders them without
numeric precision loss, then settles punctuation and casing. It may then ask
the existing managed repair route to improve that floor. The request
carries one utterance, locale, and bounded vocabulary, never tree identity or
address. A model may make one evidence-backed faithful redraft of broken spoken
grammar, but clean prose keeps a narrow edit budget and numbers, units, stable
identifiers, vocabulary, speaker, modality, relations, question type, and claim
order remain locked. Timeout, rejection, malformed output, and provider absence all return
the local rules; a future cached worker can become another proposal source
without entering React, the store, or the tree engine. The store mints one
store-unique short-lived capability after admission and consumes it on candidate,
no-change, failure, cancellation, or timeout. The driver captures the current
document epoch before speech starts; the store checks it atomically before the
pure admission translator and again through the repair capability. Its own
monotonic clock and the exact node memento decide remaining authority. A valid result is a second command with
`source: "repair"`, so both the heard expression and the correction remain
pointer-undoable. No repair lifecycle or model/cache state enters material.

A successful repair returns one private `repairChange` value to its driver,
while observable store state retains only the ordinary runtime receipt. A
feature-local bounded presentation owner validates the exact tree, document
epoch, node text, and node timestamp, then a pure bounded grapheme diff divides
the canonical string into stable runs and changed reveal units. After a 160ms
recognition beat, only inserted or replaced units arrive in reading order; a
deletion-only repair lends one adjacent glyph to the seam cue. The whole visual
sequence is capped below 800ms and retained for at most 1.2 seconds. DOM
`textContent`, selection fill, focus outline, geometry, hit targets, and the
accessible name remain complete and steady. It never renders an old-text copy,
announces status, or enters history, persistence, archive, or context. Undo,
Redo, replacement, expiry, failure, reload, and reduced-motion rendering do not
replay it.
Lasso, stretch, node drag, and Undo/Redo synchronously discard pending repair
capabilities: precise material control has priority over optional correction.

Human structure changes through the same durable kernel:

```text
selected visible node + pointer drop as before / after / in / first-level
  → pure hit projection resolves target parent + insertion slot
  → validated move-node command with source/target order mementos
  → tree engine → exact inverse
  → canvas, material index, persistence, and export re-project one tree
```

Elastic Language changes existing material without Voice:

```text
one-segment lasso → SegmentSelection       reference
stretch amount    → StretchGesture         degree
selected tool     → fixed expand-in-place  direction
tree focus        → LineageContext         lineage
                    ↓
       TransformEnvelope transform/2
                    ↓
             pointer release
                    ↓
             POST /api/turn
                    ↓
model returns { text } only
                    ↓
server constructs validated ActionPlan
                    ↓
planToTreeCommand → tree engine → exact inverse
```

The request carries no transcript and no client-authored output target. The
server derives the target from the validated selection, stretch amount, and
UTF-16 capacity; it adjudicates one complete answer before constructing the
plan. Failure leaves the selected passage unchanged, and neither the browser nor
the server retries automatically. The strict `transform/2` contract, synthetic
fixture, and focused E2E receipt are implemented; the deleted Voice-direction
`transform/1` path remains historical trace only.

Text Swap is a sibling lifecycle and protocol, not an optional branch inside
Elastic Language:

```text
one-segment lasso → SegmentSelection              reference
selected Voice     → bounded transient direction  direction
Text Swap policy   → near-source length band       degree
tree focus         → LineageContext                lineage
                       ↓
             TextSwapEnvelope text-swap/1
                       ↓
               POST /api/text-swap
                       ↓
             model returns { text } only
                       ↓
          server constructs one validated plan
                       ↓
       planToTreeCommand → tree engine → exact inverse
```

The Voice button's meaning is projected from local eligibility: Full view keeps
material admission; Focus plus exactly one current punctuation segment exposes
**Rewrite selected language**. Entering that mode makes Elastic presentation
hidden and inert before recording starts. One microphone owner and `VoicePort`
remain shared browser capabilities, but admission and Text Swap have separate
reducers, operation identities, cancellation rules, and effects. Neither can
dispatch into the other's document path. A typed accessibility fallback may
feed the same bounded transient direction port; the transport does not reveal
whether speech or typing supplied it.

The direction is held only inside the eligible local mode. A retryable failure
may retain it for one explicit retry; cancel, stale basis, mode exit, or commit
clears it. The request contains its normalized one-line text but no audio,
partial transcript, carrier, or client-authored output target. A selection,
tree, revision, document, mode, or recording ownership change aborts the request
and revokes late results. Success commits one complete range replacement; no
token, draft, old-copy, or candidate state becomes canonical material.

The material index names each node without blocking on anything:

```text
visible rows
  → deterministic label            (synchronous, always defined)
  → remote gate
  → POST /api/label
  → model returns { text } only
  → server validates and adjudicates against the deterministic label
  → browser repeats validation and adjudication
  → label session re-checks node, material fingerprint, latest operation
  → the row changes, or the answer is discarded
```

A label is derived presentation, not material: it never enters `ThoughtTree`,
material history, the material snapshot, or an archive, so it needs no document
protocol field and no migration. Accepted model labels and manual names may live
in their own browser repository; the deterministic label remains the authority
on a miss. Failure is invisible by construction, because the label a person is
reading was already usable before the request was sent.
[`reference/thought-label.md`](reference/thought-label.md) records the rejected
alternatives.

Each managed model path — admission or inquiry-draft repair, labelling, inquiry,
Elastic transform, and Text Swap — is one scenario on a single harness: a frozen
prompt built from the shared spine, a budget, and an adjudicator that decides
whether the answer beats a floor that is already correct without a model.
[`reference/prompt-harness.md`](reference/prompt-harness.md) records why the
prompt has a shape and where each scenario's judgement differs.

The provider registry, credentials, endpoint parsing, and transport stay shared
and server-only. Mutable execution state does not: each scenario owns its
governor, deadline, cache policy, and candidate-health lane. A short repair stall
therefore cannot reorder the candidates used for a background label, and a label
success cannot erase repair's own cooldown. This is one provider foundation,
not one cross-product failure domain.

The secondary inquiry is non-mutating and deliberately smaller than a material
turn:

```text
short question + lassoed passages, or bounded active-working projection when no lasso exists
  → bounded InquiryRequest → POST /api/inquiry
  → answer text or a stated unavailable reason
  → paper-corner exchange; completed terminal pairs may enter the separate,
    bounded local inquiry record, never a tree command or model context;
    reopening begins with a clean exchange
```

Only the tree engine applies durable mutations. Pointer, audio level, partial
transcript, selection geometry, focus, fold, and derived labels remain
transient.
Canvas pan, node-drag targeting, and lasso drawing are mutually exclusive
pointer modes. An outside-paper lasso particle echo is render-only; the semantic
stroke and text targets remain client-space geometry over visible canvas text.
Node drag uses one O(n) target projection at gesture start, then DOM hit testing
and lane-local binary search during pointer movement. Preview never enters React
state or `ThoughtTree`; pointer release commits one parent/index command.

Matter is local-first. The server never owns the current tree: it validates the
envelope, derives surrounding text from the supplied lineage, and returns a plan
for the revision it received. When that plan returns, the client checks the
tree id, revision, interaction identity, node, range, selected slice, and grapheme
boundaries again immediately before commit. A stale response changes nothing.

## Boundaries

| Boundary | Rule |
| --- | --- |
| Component → provider | Never direct; components use the API client. |
| Model → action | The model returns text; the server chooses the already-declared action and target. |
| Public action → private mutation | Agent actions are strictly smaller. |
| Mutation → tree | Only `applyTreeCommand` applies and constructs an inverse. |
| Tree → storage | Persistence writes committed tree snapshots; storage is not a second model. |
| DOM → pure code | DOM measures text and yields plain rects; material and layout consume plain data. |
| Runtime → tools | A pure projection exposes applicable closed intents; the rail owns no domain state. |
| Composition → adapters | An explicit composition boundary chooses concrete implementations; product-wide modes belong at the product root, while lifecycle-local resources may be constructed by their owning factory. Neither owns domain, persistence, or provider policy. |
| Store → application | The store binds observable state, public actions, and receipts; reachability does not make it the owner of every fact or lifecycle. |

## State ownership

### Locale ownership

The selected locale is presentation and request context, not material. The
browser preference controller owns it and passes the same BCP 47 value to
browser speech recognition, `/api/transcribe`, label planning, and future
generative turns. The shared allow-list lives in
`features/matter/config/locales.ts`; UI labels may be reordered without changing
the wire contract. Server boundaries reject values outside that allow-list
rather than accepting an arbitrary locale string. Adding a locale therefore
requires one config entry, UI copy, and focused server/client tests.

| Lifetime | Owned state |
| --- | --- |
| Durable material | `ThoughtTree`; it may be empty before admission, and only the tree engine changes it. |
| Durable local choice | any active-document identity or manual name promised across reload; explicit failure, never cache eviction. |
| Durable local history | complete inverse journal paired atomically with the local snapshot; Undo is visible, while Redo remains a platform keyboard convention and is not exported. |
| Navigation | focus and fold; derived view state, not history. |
| Working context | held-aside branch ids and their pure active projection; transient, local, and never a second document model. |
| Derived labels | one deterministic or model-assisted name per node; disposable, never exported, never undoable. |
| Interaction | pointer phase, anchor, lasso, geometry, audio, transcript, pending turn, inquiry draft/partials, and bounded per-node repair presentation hints. |
| Durable local inquiry | bounded Ask Matter record per tree; it is never replayed, material, history, archive, or model context. |
| Persistence | base write generation, persisted/queued/dirty revision, and recoverable error. |

Identifiers and units do not substitute for one another:

| Value | Meaning |
| --- | --- |
| `revision` | monotonic durable tree commit number |
| `writeGeneration` | storage compare-and-swap publication number |
| `interactionId` + `attempt` | one cancellable async operation, not document history |
| text offsets | UTF-16 code units, checked against grapheme boundaries |
| geometry | client CSS pixels tied to one transient `layoutEpoch` |
| stretch `amount` | unitless normalized expansion value in `(0, 1]` for a transform request |
| durable time / duration | canonical ISO string / integer milliseconds |

Ids and durable timestamps enter domain commands as values. Pure modules never
read a clock, random source, DOM, network, or storage directly.

Interaction authority is split into focused lifecycles, not one application-wide
reducer. Admission has an explicit reducer and effect driver; lasso and stretch
have their own focused reducers; the Elastic Language turn starts from one
settled pointer release rather than borrowing admission's Voice lifecycle. Text
Swap owns a separate selected-segment direction and request lifecycle while
borrowing only the narrow recording capability. Rendering-edge code coordinates
their visible precedence and pointer availability. Each lifecycle owns its
start, event, commit or cancel, and cleanup transitions. An async lifecycle also
carries its operation identity, attempt, document, and revision basis.

Pointer cancel, lost capture, unmount, and a newer interaction interrupt the
relevant owner and clean up audio, ranges, highlights, workers, and timers.
Hooks adapt browser events to those owners; they do not each invent a partial
copy of another lifecycle.

A shared coordinator is justified only when current behavior proves that two
lifecycles share one invariant that the rendering edge cannot safely enforce.
If introduced, it owns only their active mode, operation identity, and document
epoch. It does not absorb microphone internals, worker queues, request retries,
layout caches, provider policy, or persistence, and it never becomes a generic
`MatterController`.

Selection state separates a semantic `TextAddress` from layout-epoch-bound DOM
rectangles. A lasso may yield an ordered transient set of addresses; contiguous
runs remain independently addressable so a gap can never silently become one
replacement range. Full-tree projection removes folded descendants; the active
working projection also excludes held-aside branches. Focus projection returns
the exact root-to-node path and ignores folds on it. Only focus view can start a
generative transform, so model context cannot be narrower than the material
visible during that turn. Exactly one current punctuation segment is the shared
eligibility boundary; Elastic and Text Swap are mutually exclusive consumers of
it.

Async effects are limited to recording, transcription, labelling, inquiry, planning,
persistence, and archive transport. Every completion returns with
`{ interactionId, attempt, treeId, baseRevision }`; cancellation aborts work
where possible, while token and current-tree validation make a late completion
harmless. A one-request model scenario receives the route boundary's combined
disconnect/deadline signal. A deduplicated label flight is the deliberate
exception: one caller stops waiting but cannot cancel provider work shared by
another caller. React hooks dispatch events and execute effects but do not own a
second interaction lifecycle.

For portability, browser facilities sit behind narrow capability ports:
`VoicePort`, `InquiryClient`, `TurnClient`, `DocumentRepository`, and `ArchivePort`. The first
release implements only browser/HTTP adapters; it does not create a generic SDK
or speculative native adapter. The tree, material, layout, and runtime reducers
remain framework-free TypeScript.

Concrete ports are chosen at an explicit composition boundary and each consumer
receives only the capability it needs. Product-wide fixture or live modes are
selected at the product root; a lifecycle-local repository, worker, or request
may be constructed by the focused factory that owns its cleanup. A store,
component, or use case never discovers a global service bag or silently chooses
between fixture and live behavior for itself.

## Cache and recovery

Caches hold only reproducible work: derived segments may key on node text;
measured ranges key on `layoutEpoch`; encoded snapshots key on tree revision;
server label answers key on a non-cryptographic fingerprint of the material,
locale, bound, and prompt version, and are re-validated on every read rather
than trusted because they were written by this process.
They are disposable and never authoritative. Raw audio, transcripts, repair or
inquiry answers, transform responses, and lineage are not cached. A bounded diagnostic trace may record
operation ids, state transitions, error codes, durations, and byte counts, but
never material or voice content.

Recovery stays with the state owner: a validated inverse journal recovers local
undo after reload; interaction cancel preserves its semantic address for pointer
retry; persistence retains the latest dirty snapshot until a generation-checked
save succeeds. An archive import starts a new journal, and a legacy snapshot
that predates journal storage remains usable but begins with an empty history.
No write-ahead log, event sourcing, service worker, or background sync belongs
in the first release.

## Target modules

The active product lives entirely beneath `features/matter/`. The retired scene
implementation remains available only in `archive/` for traceability.

```text
app/
  page.tsx                         /matter through the Next.js basePath
  api/health/route.ts              implemented deployment readiness boundary
  api/transcribe/route.ts          strict speech boundary; browser mode never uses fixture output
  api/repair/route.ts              bounded transcript-repair boundary; answers are adjudicated before use
  api/label/route.ts               implemented label boundary; live adapter gated
  api/inquiry/route.ts             bounded non-mutating inquiry boundary and server-owned answer adapter
  api/turn/route.ts                implemented strict transform/2 boundary and fixture gate
  api/text-swap/route.ts           frozen sibling text-swap/1 boundary; independent live gate

features/matter/
  server/harness.ts                the only place a model is awaited; one scenario contract
  server/prompt-spine.ts           the shape every Matter prompt has, and its fenced material
  server/*-harness.ts              one scenario each: repair, label, inquiry, transform, text swap
  server/model-pool.ts             the only place an endpoint, model name, or key appears
  tree/                            model, invariants, engine, history, lineage
  material/                        graphemes, segments, pure lasso rules
  material/inquiry-context.ts      bounded visible-lineage inquiry projection
  layout/                          visible traversal and focus/fold projection
  tools/                           pure capability projection and closed intents
  runtime/                         pure event reducer and effect descriptions
  interaction/                     DOM geometry and pointer/voice adapters
  persistence/                     codec, IndexedDB, archive transport
  server/                          provider adapters, planner, transcription
  components/
  store/
```

- `tree/`, `material/`, `layout/`, and `tools/` do not import React, DOM, store, or server code;
- components dispatch `ToolIntent`; the controller revalidates it and calls a
  named runtime action rather than exposing private tree mutations;
- the interaction state reducer is pure; its DOM and microphone adapters are not;
- DOM `Range` and `getClientRects()` live at the interaction/rendering edge;
- `server/` is the only place a configurable or credentialed provider name appears;
- route handlers parse, delegate, and translate only.

### Context, harness, and memory ownership

These are separate layers, even when one small route currently crosses all of
them:

1. `material/*-context.ts` projects the visible document or explicit lasso
   address into bounded reference material. It knows tree semantics, not models.
2. `server/*-contract.ts` validates the versioned network envelope and repeats
   every hard bound. It carries data only; prompts and scenarios do not belong
   to protocol.
3. `server/*-harness.ts` owns a named scenario's prompt, context allocation,
   deadline, output budget, and response validation. It receives already
   bounded material and returns only the scenario result.
4. `server/*-provider.ts` owns credentials, model pools, transport quirks, health
   and fallback. It never chooses document scope.

The bounded completed Ask Matter record is local-only and is not an index. It
never feeds prior answers back into a prompt. Durable material history remains
tree commands plus snapshots; the record has its own generation-checked
repository and is not exported with material. Derived labels live in
`persistence/` keyed by tree, node, and material fingerprint. A future search
or memory index belongs in its own repository beside persistence, stores
revision-addressed derived records, and may supply context only through an
explicit context projector. It must not become hidden retrieval for generative
tree changes.

Browser speech recognition is the narrow platform-capability exception: it uses
no Matter credential, exposes no provider choice in the client, and commits
only through the same bounded human-admission command. Any configurable or
credentialed speech/model provider remains in `server/` (or behind a separately
frozen same-origin credential boundary). Browser speech and MediaRecorder upload
are distinct, explicit client build capabilities and both default off; API
presence and a server adapter name never implicitly select a transport or grant
the browser permission to collect or upload audio. Voice admission is reported
available only when at least one of those client transports is enabled. Client
readiness may construct one unstarted native recognition object or await a
bounded local-worker code handshake; permission, capture, audio decoding, and
model initialization remain behind the person's first voice turn.

`app/api/health` is a deployment probe, not a debug console; under the Matter
base path it is reached as `/matter/api/health`. It reports only stable Matter
surface states: protocol version, app version, configured base path, and whether
first-release gates are available, fixture-only, unavailable, or not yet
implemented. It never returns provider names, raw environment values, stored
material, transcripts, or lineage.

The complete dependency choice and rejected foundations are in
[`reference/foundation.md`](reference/foundation.md). The short version: Matter
owns its tree and interaction semantics; generic IndexedDB and ZIP mechanics may
use small leaf dependencies when those slices begin.

## Deployment and naming

Matter is independently deployed beneath `ptoq.io/matter` by default. The base
path is `MATTER_BASE_PATH=/matter`; a dedicated custom domain may set the value
to an empty string so `app/page.tsx` owns `/` without forking the application.
Therefore `app/page.tsx` is the product page, `app/api/turn` resolves under
`/matter/api/turn`, and `app/api/text-swap` resolves under
`/matter/api/text-swap` at the default base path.

`0.2` has no compatibility aliases because no `0.1` document was persisted.
The two generative mutation routes are strict, versioned, and fixture-gated;
their live providers remain independently gated. `/api/inquiry` exists
separately because it cannot construct a plan or mutate material; an old scene
route is never renamed into place.

No auth, sync, collaboration, queue, worker, vector store, retrieval, or realtime
transport belongs in this migration.
