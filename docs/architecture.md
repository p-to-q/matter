# Architecture

## Runtime paths

Human material enters without a generative model call:

```text
node reference + microphone
  → browser-native Web Speech API (preferred)
  → POST /api/transcribe when an explicit server adapter exists
  → transcript
  → human insert command
  → tree engine
```

Human structure changes through the same durable kernel:

```text
selected non-root node + pointer drop on another visible node
  → validated move-node command with source/target order mementos
  → tree engine → exact inverse
  → canvas, material index, persistence, and export re-project one tree
```

Existing material changes through the four-signal grammar:

```text
lasso        → SegmentSelection       reference
stretch      → StretchGesture         degree
voice        → transcript             direction
tree focus   → LineageContext         lineage
                    ↓
          TransformEnvelope
                    ↓
             POST /api/turn
                    ↓
model returns { text } only
                    ↓
server constructs validated ActionPlan
                    ↓
planToTreeCommand → tree engine → exact inverse
```

The material index names each node without blocking on anything:

```text
visible rows
  → deterministic label            (synchronous, always defined)
  → remote gate
  → POST /api/label
  → model returns { text } only
  → server validates and adjudicates against the deterministic label
  → label session re-checks node, material fingerprint, latest operation
  → the row changes, or the answer is discarded
```

A label is derived presentation, not material: it never enters `ThoughtTree`,
history, persistence, or an archive, so it needs no protocol field and no
migration. Failure is invisible by construction, because the label a person is
reading was already correct before the request was sent.
[`reference/thought-label.md`](reference/thought-label.md) records the rejected
alternatives.

Only the tree engine applies durable mutations. Pointer, audio level, partial
transcript, selection geometry, focus, fold, and derived labels remain
transient.
Canvas pan, node-drag targeting, and lasso drawing are mutually exclusive
pointer modes. An outside-paper lasso particle echo is render-only; the semantic
stroke and text targets remain client-space geometry over visible canvas text.

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
| Runtime material | forward/inverse history; bounded, not exported. |
| Navigation | focus and fold; derived view state, not history. |
| Labels | one derived name per node; disposable, never exported, never undoable. |
| Interaction | pointer phase, anchor, lasso, geometry, audio, transcript, pending turn. |
| Persistence | base write generation, persisted/queued/dirty revision, and recoverable error. |

Identifiers and units do not substitute for one another:

| Value | Meaning |
| --- | --- |
| `revision` | monotonic durable tree commit number |
| `writeGeneration` | storage compare-and-swap publication number |
| `interactionId` + `attempt` | one cancellable async operation, not document history |
| text offsets | UTF-16 code units, checked against grapheme boundaries |
| geometry | client CSS pixels tied to one transient `layoutEpoch` |
| stretch `amount` | unitless normalized expansion value in `[0, 1]` |
| durable time / duration | canonical ISO string / integer milliseconds |

Ids and durable timestamps enter domain commands as values. Pure modules never
read a clock, random source, DOM, network, or storage directly.

The interaction controller is an explicit reducer:

```text
Idle
Lassoing
Armed { address, geometry, amount,
        voice: idle | permission | recording | transcribing,
        stretch: idle | dragging }
Pending { interactionId, envelope }
Applying
Error { recoverableState }
```

Voice and stretch are parallel substates because a person may stretch while
speaking. Pointer cancel, lost capture, unmount, and a newer interaction
interrupt the relevant substate and clean up audio, ranges, highlights, and
timers. Hooks adapt browser events to the controller; they do not each invent a
partial lifecycle.

Selection state separates a semantic `TextAddress` from layout-epoch-bound DOM
rectangles. A lasso may yield an ordered transient set of addresses; contiguous
runs remain independently addressable so a gap can never silently become one
replacement range. Full-tree projection removes folded descendants. Focus projection
returns the exact root-to-node path and ignores folds on it. Only focus view can
start a generative transform, so model context cannot be narrower than the
material visible during that turn.

Async effects are limited to recording, transcription, labelling, planning,
persistence, and archive transport. Every completion returns with
`{ interactionId, attempt, treeId, baseRevision }`; cancellation aborts work
where possible, while token and current-tree validation make a late completion
harmless. React hooks dispatch events and execute effects but do not own a
second interaction lifecycle.

For portability, browser facilities sit behind narrow capability ports:
`VoicePort`, `TurnClient`, `DocumentRepository`, and `ArchivePort`. The first
release implements only browser/HTTP adapters; it does not create a generic SDK
or speculative native adapter. The tree, material, layout, and runtime reducer
remain framework-free TypeScript.

## Cache and recovery

Caches hold only reproducible work: derived segments may key on node text;
measured ranges key on `layoutEpoch`; encoded snapshots key on tree revision;
server label answers key on a non-cryptographic fingerprint of the material,
locale, bound, and prompt version, and are re-validated on every read rather
than trusted because they were written by this process.
They are disposable and never authoritative. Raw audio, transcripts, model
responses, and lineage are not cached. A bounded diagnostic trace may record
operation ids, state transitions, error codes, durations, and byte counts, but
never material or voice content.

Recovery stays with the state owner: command inverses recover in-session
material; interaction cancel preserves its semantic address for pointer retry;
persistence retains the latest dirty snapshot until a generation-checked save
succeeds. No write-ahead log, event sourcing, service worker, or background sync
belongs in the first release.

## Target modules

The active product lives entirely beneath `features/matter/`. The retired scene
implementation remains available only in `archive/` for traceability.

```text
app/
  page.tsx                         /matter through the Next.js basePath
  api/health/route.ts              implemented deployment readiness boundary
  api/transcribe/route.ts          strict speech boundary; browser mode never uses fixture output
  api/label/route.ts               implemented label boundary; live adapter gated
  api/turn/route.ts                gated generative transform boundary

features/matter/
  tree/                            model, invariants, engine, history, lineage
  material/                        graphemes, segments, pure lasso rules
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

Browser speech recognition is the narrow platform-capability exception: it uses
no Matter credential, exposes no provider choice in the client, and commits
only through the same bounded human-admission command. Any configurable or
credentialed speech/model provider remains in `server/` (or behind a separately
frozen same-origin credential boundary).

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
Therefore `app/page.tsx` is the product page and
the future `app/api/turn` route resolves under `/matter/api/turn` when built.

`0.2` has no compatibility aliases because no `0.1` document was persisted.
Generative provider routes are absent until their Matter-native envelopes and
error boundaries are implemented; an old scene route is never renamed into place.

No auth, sync, collaboration, queue, worker, vector store, retrieval, or realtime
transport belongs in this migration.
