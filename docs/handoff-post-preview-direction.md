# Handoff — Matter post-preview direction

This is a planning map for work that may follow the first release. It is not a
second roadmap, a product or system contract, or authorization to implement a
feature. The current contract documents and
[`../plans/active-tree-material.md`](../plans/active-tree-material.md) remain
authoritative. This note exists so a later owner or agent can resume the work
without the conversation that produced it.

```text
Status:     planning only; no new slice is frozen; implementation is not authorized
Scope:      product direction, context projections, interaction legibility,
            private/local intelligence, generated media, and later sync research
Validation: repository and document audit; primary-source research; docs checks only
Risks:      a second source of truth, speculative infrastructure, false offline
            or open-source claims, and overlapping agent edits
Next:       when research budget returns, the owner authorizes Wave 1 or starts with C0
```

## Why this work exists

Matter aims to help people meet real problems in real life while keeping the
handle with the person. Its longer direction now states that material outlives
the model: the rooted tree and portable structure remain authoritative while a
private API or qualified local runtime is a replaceable capability.

Several requested improvements meet at that principle: preserving coherence in
copy and Markdown, giving both AI surfaces the right structural context, making
lineage legible across the index and canvas, reducing the editing rail, and
leaving a credible road toward local and multimodal intelligence. Treating them
as one implementation project would hide important product decisions. This
handoff instead separates the decisions, research, and eventual proof.

## What is already decided

- One rooted text tree remains the durable material authority. A projection,
  renderer, prompt envelope, or receipt cannot become a second document model.
- AI output reaches durable material only through one bounded operation and the
  tree engine; Ask Matter remains read-only.
- Material must stay understandable, keepable, and movable without the provider
  that once helped shape it.
- The present web release states its network dependence honestly. Local document
  storage is not evidence of offline generative inference.
- A local, offline, learning capability already ships. Wiki is an origin-local
  lexical authority behind material ingress, qualified by `npm run qualify:wiki`,
  and it crosses no model, wire, archive, or history boundary. It is explicitly
  not a notebook, retrieval index, prompt supplement, or second document model.
  Local intelligence is therefore not a greenfield question here; its first
  working proof is already in the product.
- Matter remains proprietary and `UNLICENSED`. Local deployment, an open
  interchange format, and open-source software are separate decisions.
- The first-release roadmap remains the only active roadmap. No work in this
  handoff enters a build until one slice is researched, selected, frozen, and
  added to that roadmap by the owner.

## What remains open

- whether one shared material projection should serve AI context, a context
  receipt, and later diagram renderers;
- whether a context receipt is primarily human-readable, machine-readable, or
  explicitly dual-representation;
- how `selection`, `lineage`, and `working-tree` migrate in stored Inquiry
  records before they become the shared address vocabulary;
- what ancestor emphasis and canvas connectors mean: navigation, visible
  lineage, or the basis of an active operation;
- which operations form Matter's native editing rail after the Preview-only
  Branch composition leaves the main product;
- what qualifies a browser or desktop runtime as local, offline, and private;
- how an image, sound, or other generated asset acquires a complete material
  lifecycle before its control appears;
- whether replicated computation is ever needed beyond portable export and
  single-device local authority.

## Decision ledger

| Topic | State | Current authority | Evidence or decision needed to advance |
| --- | --- | --- | --- |
| Help with real-life problems while preserving agency | accepted direction | `product.md`, `principles.md` | corrected owner intent |
| Material outlives the model | accepted principle | `product.md`, `principles.md`, `changes.md` | corrected owner intent or a proven contradiction |
| Rooted tree is material authority | frozen current contract | `material.md`, `architecture.md` | a separately promoted durable material concept |
| Three Inquiry addresses | specified, not implemented; stored vocabulary decided (map, no migration) | active plan, Wave 1 synthesis | the C0 first slice proves byte-equal wire output |
| Shared material context projection | first slice frozen, not promoted | Wave 1 synthesis | owner promotion and an independent contradiction review |
| Context receipt | open candidate | `open.md` | purpose, privacy, format, clipping, and compatibility decisions |
| Lineage-aware index and canvas | open candidate | `open.md` | I0 interaction state table and accessibility proof plan |
| Main-rail Branch removal | blocked: no human child-creation path without it | Wave 1 synthesis | a decided replacement for child creation, a named Preview flag, and eight e2e specs migrated |
| Local/private intelligence runtime | accepted direction, no capability claim; one headless probe proposed | Wave 1 synthesis | the probe receipt; nothing qualifies yet |
| Generated media as material | S1 shipped closed; S2 engine shape decided (pointer on node) | Wave 1 synthesis, `reference/generated-image.md` | slice 1 (tree and codec, dark) and the owner's spend decision |
| Local lexical authority (Wiki) | shipped, record V7 | `reference/wiki.md`, `surfaces.md` | nothing to advance; it is the baseline C0 and L0 must read |
| Wiki settle inside a context receipt | decided: canonical text only | Wave 1 synthesis | none unless a receipt is ever promoted |
| Replicated computation or sync | conditional research only | `open.md` | observed cross-device or collaboration need |

## Program plan

### Stage 0 — planning record

This stage changes documents only. It preserves the accepted product direction,
records candidates and promotion conditions, and leaves executable work closed.
It must not change `ThoughtTree`, a protocol, Archive, provider validation, UI,
or the active first-release plan.

### Wave 1 — bounded product and projection research

Run at most three read-only researchers beside one integrator. Researchers do
not edit shared contract documents.

**P0 — Product and problem truth**

```text
Outcome:      state which real human problem the next slice improves
Question:     which principles from augmentation, Dynamicland, Croquet, and
              local-first computing fit Matter's problem, and which do not?
Deliverable:  Borrow / Do not borrow / Why decision memo
Stop:         one product outcome and one falsifiable proof boundary are clear
Non-goals:    a feature list, positioning Matter as BCI, or copying another system
```

**C0 — Context and receipt**

```text
Outcome:      one decision-ready shape for coherent, bounded tree projection
Question:     how should ids, order, relations, address, clipping, privacy,
              version and digest survive AI context and deliberate export?
Deliverable:  current-state audit, no more than three candidate shapes, a
              compatibility table, recommendation, rejection and reversal conditions
Stop:         a freezer can name one pure projection boundary and its proof
Non-goals:    changing protocol, Archive, Copy, prompts, or importing a graph library
```

C0 must read [`reference/wiki.md`](reference/wiki.md) before auditing current
truth. Wiki settles a heard form to a canonical one at ingress, so material
already carries the canonical wording and no Wiki transform occurs at prompt
time — Wiki is by contract not a prompt supplement. The open question is
therefore narrower than it first appears: a receipt that claims to carry a
person's own words must decide whether a settled occurrence appears as the
canonical form alone, or discloses that a settle took place. C0 must also read
the Preview.64 work that made Wiki addressable, because that address vocabulary
and C0's `selection` / `lineage` / `working-tree` vocabulary meet.

**I0 — Interaction grammar**

```text
Outcome:      a state table for lineage legibility and the native editing rail
Question:     what is highlighted or connected, when, why, and with which
              accessibility meaning; where does Preview Branch move?
Deliverable:  journey audit, operation-state table, rail inventory, removal gates
Stop:         navigation, selection, operation basis and read-only inquiry are distinct
Non-goals:    CSS, SVG, toolbar, or route implementation
```

The owner then performs one synthesis. A disagreement stays visible in the
ledger; it is not averaged away by the integrator.

### Wave 2 — capability research after C0

**L0 — Local and private runtime.** Compare a private HTTPS API, browser WebGPU,
and a trusted desktop runtime. Record model provenance, licence, artifact
integrity, installation and cold start, memory and device floor, cancellation,
resource ownership, update and rollback, offline proof, and the boundary that
keeps the web provider's private-network rejection intact. Do not choose a
desktop shell or write an adapter.

**M0 — Generated-media material lifecycle.** Start only after C0 can address and
receipt material. Define source address, instruction, asset identity and hash,
original and derivative ownership, preview versus acceptance, exact undo,
persistence, quota and garbage collection, Archive, deletion, model context,
accessibility, and privacy. Until this closes, no Image control appears.

Owner direction of 2026-10-11 authorized a bounded research pass and an
interface, not a control. The findings below are recorded so M0 starts from
them. They constrain the design; they do not promote a slice.

*An image cannot be a derived record.* `architecture.md` already sanctions a
derived per-node repository beside persistence, and labels prove the shape. The
analogy breaks on one point and it is decisive: a deterministic label is
disposable because it can be recomputed, so `retainNewestModelLabels` may
reclaim it oldest-first. A generated image cannot be recomputed. Reclaiming one
would silently lose something irreplaceable, against both the Preview.64
campaign and principle 8's `persistence` and `export` clauses. The image is
therefore material, and its lifecycle is the expensive path.

*A text pointer is what becomes material; bytes never enter the tree.* The Git
LFS pointer is the reference shape: UTF-8 text, under 1024 bytes, canonically
encoded with sorted keys, carrying `oid sha256:…` and `size`. Three properties
transfer. A content hash makes an insert idempotent and an undo cheap. The
redundant `size` is the partial-availability story: existence, type and byte
count are known without a single byte of content. And the pointer is text, so it
survives `snapshot-codec`'s `Record<path, string>` and the archive's fatal UTF-8
decode unchanged. The durable mutation carries a pointer, not a payload, which
also leaves `MATTER_HISTORY_LIMITS.maxRetainedInverseBytes` reasoning intact.

*Missing bytes must be a first-class named state, decided before the control
ships.* Git LFS writes the pointer text into the working tree in place of the
file; Excalidraw puts `status: "pending" | "saved" | "error"` on the element
itself; tldraw renders a named broken-asset placeholder. The products that did
not decide this are the ones with forum threads and third-party repair plugins.
A document whose bytes are absent must still open, and must say so.

*Nothing reference-counts, and that is not an oversight.* Excalidraw collects on
time (unused on canvas and `lastRetrieved` older than a day); tldraw declines
ownership outright and offers an optional `remove()`. Reference counting over
current state is unsound here because Undo is a forward operation that can
resurrect any historical reference. So: orphan-tolerant by default, collected
only at an explicit compaction or export boundary, never on the undo path.

*Browser eviction is all-or-nothing per origin, which is better than it sounds.*
The Storage Standard evicts a whole bucket, and MDN is explicit that all of an
origin's data is deleted together "to avoid inconsistency". The failure mode is
therefore not a tree pointing at vanished bytes; it is total local loss, which
only export addresses. `navigator.storage.estimate()` is documented as
imprecise, so it is a UI hint and a soft gate, never an accounting ledger.

*Store `Blob`, never base64.* IndexedDB stores a real `Blob` without
re-encoding, and Chromium's compression is explicitly ineffective on already
compressed media. A data URL costs about a third in size; Excalidraw pays it
only to keep one self-contained JSON file. Matter already exports a ZIP, so
bytes belong in binary ZIP entries and base64 is never needed.

*Provenance is binary and binds to final bytes.* C2PA gives no partial credit:
an unsigned assertion is not a Content Credential, and a validator rejects it as
`claimSignature.missing`. The hard binding is computed over the final bytes, so
any re-encode on export breaks it. The affordable step is to record a
`c2pa.actions.v2` assertion with `digitalSourceType` of `trainedAlgorithmicMedia`
in Matter's own sidecar now, and to show no verification affordance until
signing and timestamping exist.

What M0 still owes: the archive's third path shape and the one place it must not
decode UTF-8; the `IndexedDB` version step and its terminal-state story; the
mutation pair and its exact inverse; and the reading of "every committed
generative change is pointer-undoable" for a change whose payload is a hash.

*The transport is already relay-neutral, and the local road speaks it.*
`POST /v1/images/generations` with `{model, prompt, n, size}` returning
`data[].b64_json` is a de-facto multi-vendor contract: OpenAI defines it,
Together serves it natively, Google serves it on a compatibility path, a
self-hosted LiteLLM proxy fans it out, and — decisively — `stable-diffusion.cpp`'s
`sd-server`, Xinference and LocalAI serve it locally today. So an image port is
the same operator-configured base URL and key the chat pool already uses, and
the committed on-device road needs no second contract. Synchronous and base64
only: an expiring URL is a fracture (ten minutes at one vendor, an hour at
another), and the two async-only vendors are reachable synchronously through a
gateway, so Matter never teaches a pool to poll.

*Two vendors are excluded on terms, not on capability.* One grants no ownership
of output at all; another takes a perpetual, sublicensable licence over inputs
and outputs to train its models. For a product whose pitch is that a person's
own writing stays theirs, those terms disqualify a vendor from the core more
firmly than any latency number. Self-hosted weights carry their own cliffs: one
popular open model is non-commercial, and another's community licence ends at a
revenue threshold.

*The image cannot be re-derived, and that is a contract requirement.* There is no
`seed` parameter on the leading image API and determinism is not guaranteed
across gateways. "Material outlives the model" therefore obliges Matter to store
the prompt, the model identity, and the full parameter set beside the bytes. This
is the second independent reason the image is material rather than a derived
record: a label can be recomputed, and this cannot be, by construction.

*Marking is law now, and re-encoding breaks it.* Machine-readable marking of
synthetic output has applied in the EU since 2 August 2026. The duty falls on the
provider, so vendors already embed C2PA or an invisible watermark with no off
switch — but a resize or re-encode is likely to destroy the C2PA manifest while
the invisible watermark survives. Preserving provider metadata is a product
requirement, not a nicety.

### Proposed slices — not promoted

Two slices, in order. Only the owner may move either into the active plan.

**S1 — image capability behind a closed gate, with no control**

```text
Outcome:    a person's addressed passage can become one in-style image on the
            server, reachable by fixture and by an operator-configured relay.
            Nothing becomes durable, nothing is cached, and no control appears
Boundary:   two scenarios on the existing harness — a brief scenario returning
            only { text }, and an image scenario whose PoolTransport overrides
            completionUrl, serialize, parseCompletion and acceptsResponse; one
            image station in the existing pool namespace; one route; one gate
            switch, off by default; a fully lazy chunk
Invariants: the person's passage reaches only the brief scenario, never the
            image relay; the brief is adjudicated before any image call, so a
            hostile passage costs a text call and not a generation; the image
            scenario passes its own maxResponseBytes and leaves the 32 KiB
            default untouched for every other scenario; no tree mutation, no
            snapshot, no archive, no history, no Wiki contact; every outbound
            protection is inherited from the pool rather than reimplemented —
            base-URL rejection, redirect: "error", cache: "no-store", the raced
            abort, the Content-Length fast-fail, the bounded accumulator, the
            drain lease, and per-scenario candidate health
Proof:      fixture round-trip for both scenarios; a hostile passage settles on
            the floor at the brief step with no image call made; byte-ceiling
            refusal; deadline and cancellation; check:architecture still reports
            no provider leak; the new route listed in API_ROUTES and absent from
            the prerender manifest; the runtime artifact budget unchanged
Non-goals:  a visible control, durable material, an image cache, polling
            transports, accepting a provider URL as the result, raising any
            shared pool ceiling, a second fetch path outside the pool, and
            provenance signing
```

**S2 — the material lifecycle** (audited 2026-10-12; slices below)

```text
Outcome:    an accepted image is durable, pointer-undoable material that survives
            export, reimport, and the absence of its own bytes
Boundary:   an optional `ThoughtNode.image` pointer; one self-inverse
            `replace-image` mutation; a content-addressed `blobs` store in the
            same database; binary archive entries in a separate channel; the
            `IndexedDB` version step; a derived availability projection
Invariants: the tree carries a pointer and never bytes, so undo and redo need no
            I/O; a document whose bytes are absent still opens and says so;
            `insert-node` cannot carry an image and `updatedAt` is not bumped by
            attaching one, so no text lineage check is invalidated; collection is
            orphan-tolerant and never runs on the undo path; the prompt, model
            and parameters are stored beside the bytes because the image cannot
            be re-derived; the engine is expand-then-contract, so the version
            step ships dark before any writer exists; bytes are never re-encoded
Proof:      attach, replace and detach with exact inverses; undo and redo with
            `indexedDB` undefined; codec determinism; hostile archive entries
            (hash, sniff, size, orphan, bomb); quota refusal on the blob blocks
            the commit; propose, preview, Keep, undo, redo, reload, export,
            reimport; the three missing states rendered; archive determinism
Non-goals:  reference counting, base64 anywhere in the archive, a verification
            badge, collaboration, several images per passage, and any second
            durable material authority
```

A bounded probe of one operator-supplied relay, the illustration style the
owner selected, and the exact harness and gates are recorded in
[`reference/generated-image.md`](reference/generated-image.md). It names no
chosen provider and carries no credential.

The `绘图` label belongs to S2, not S1. A visible control that cannot act is
still a product claim about an unbuilt capability, which principle 8 exists to
prevent; the lens already has a present-but-unavailable pattern, so shipping it
early would be cheap and still wrong. Recorded as the owner's call.

One shortcut was considered and rejected for the core: one gateway can already
emit images through `/chat/completions` with an output-modality field, which
would need no new route. It would also require raising the chat pool's response
ceiling by more than fifty times and changing its return type — fracturing the
one seam S1 exists to protect. It stays a noted alternative, not the path.

**S0 — Replicated computation.** Start only when observed multi-device or
collaboration demand cannot be met by explicit export. Compare ordered event and
snapshot approaches, Croquet, Automerge, Yjs, and problem-shaped industry sync.
Do not pre-authorize a CRDT, event log, reflector, cloud authority, or generic
sync engine.

```text
P0 ─┬─> owner synthesis
C0 ─┤       ├─> first freeze candidate
I0 ─┘       └─> L0 research
C0 + L0 ──────> M0 research
observed cross-device need ──> S0 research
```

### Wave 1 synthesis — 2026-10-12

Five read-only researchers (C0, I0, S2 engine, image control, L0) reported
against the code. Where a memo contradicts an earlier line of this handoff, the
contradiction is recorded here rather than averaged away.

**C0 — recommendation adopted, narrowed.** The premise was partly wrong: native
Copy produces no Markdown at all (node text joined by blank lines), and Inquiry's
`tree` scope is not structurally lossy, because preorder plus truthful `depth`
encodes parent and sibling order exactly. Archive is already the lossless
representation. So the first slice is not a receipt:

- *Stored vocabulary — decided:* **map, do not migrate.** `basis.scope` has no
  reader outside its validator, `recordSchemaVersion` is the literal `1`, and one
  unknown value fails the whole tree record (up to twenty exchanges) for a
  rolled-back build or stale tab. The wire keeps `selection | tree`; `lineage` and
  `working-tree` both map to `tree` until a reader needs the distinction. This
  retires owner question 3.
- *Wiki — decided:* a receipt carries **canonical text only** and never says a
  settle occurred. The occurrence registry is in memory, bounded to five minutes,
  and holds no text; a durable flag would be a new per-node annotation and would
  make the receipt non-deterministic across reloads. At most one static sentence
  at the version level.
- *Finding:* the tested projector (`projectActiveWorkingContext`) is called only
  from tests; production derives the working nodes inline in `RootedMaterial.tsx`.
  A reference doc that says "one pure projection is the authority" describes a
  test-only twin. The first slice makes them one function.

```text
Outcome:    the active working projection is one pure function,
            `projectActiveViewContext(view, activeNodeIds)`, called by the shipped
            Material root and by every test; the test-only twin that derived the
            projection from the tree alone is deleted
Boundary:   `material/working-context.ts`, its two test files, and the one call
            site in RootedMaterial.tsx; no protocol, storage, Archive, Copy, or
            prompt change
Invariants: wire bytes identical to today; the view is the first term, so focus
            and fold decide what is addressed; depth is the view's, never
            recomputed; nothing outside `material/` is imported
Proof:      the shipped path now has unit tests (view order and depth, focus
            view, folded view, frozen result, inputs unmutated); the existing
            InquiryContext goldens run through the shared function; mutating the
            filter or the depth fails them
Non-goals:  parentId, siblingIndex, a `lineage` address, a receipt, a digest, a
            new wire scope, a stored-row migration, a structured Copy, merging
            the transform and text-swap lineage types
```

Status: **built** (2026-10-12). The first draft of this block also added
`parentId`, `siblingIndex` and a focus `lineage` address. They were cut because no
consumer reads them and an unread field is an undeclared contract; they return
with the first receipt that needs them.

Contrary evidence kept: nothing in the repository shows a user-observed failure
from lost structure; the lineage fields double as the stale check, so unifying
them with Inquiry risks weakening it; wire parsers use exact keys, so each added
field is a protocol bump.

**I0 — Branch stays; the index line ships.** The packet's own gate fails: Branch
is the only visible way to create a human-initiated child under a selected
passage. Voice does not cover it, because a selected passage routes fixed Voice
to Point and Talk by design. Removing Branch breaks eight e2e specs (sixteen
locators) and four unit files and leaves no human path to depth beyond level
one. Slice A shipped as `ad29808`: the index underlines the ancestors of the
active passage (static, no weight or plate, `aria-selected` stays with the
target). Canvas connectors are deferred: nothing in `tree-layout.md` allows a
persistent connector, only an operation-scoped one, and the 2,000-node receipt
(`elementCount ≤ 4700`, long task `< 100 ms`) must be measured with the path
present. The real blocker is a decision: where child creation lives once Branch
leaves (a deliberate "below" target on selected Voice, which contradicts
`product.md`, or a Control Fog action).

**L0 — keep open; authorize one headless probe.** Path C (a hashed local GGUF
served by a child `llama-server`) is the only path that gives hash pinning, a
stated device floor, and Chinese and Japanese coverage together. Chrome's Prompt
API lists no Chinese and has no pin; WebLLM's integrity check does not cover the
weight shards; the repository's own Whisper work shows export fragility. The
web product's rejection of loopback and private addresses is unchanged, and
`isHttpsOrLocal` is operator configuration that must not be copied into a client
path. Loopback is not a boundary (DNS rebinding, permissive default CORS).

```text
Outcome:    a maintainer-only receipt that one pinned small GGUF, served by a
            child llama-server, passes Matter's strict classifiers offline
Boundary:   a headless script and corpus; no desktop shell, no product route,
            no model-pool.ts change
Invariants: web rejection of loopback and private addresses untouched; no byte of
            tree beyond the admitted text reaches the runtime; claims limited to
            the inference path of the receipt
Proof:      artifact sha256; offline cold start with zero egress; cancel-to-idle
            bound; canary no-leak; per-language over-correction and latency;
            digests committed with --check, on the qualify:wiki pattern
Non-goals:  an Electron or Tauri choice, WebGPU or Prompt API adapters, the image
            path, a user-facing "offline" or "private" label, hosted replacement
```

Reversal: Chinese or Japanese repair over-corrects even constrained (narrow L0 to
labels and inquiry), or a disconnect does not free the slot. Licences were read
from model-card headers only.

**Image control — no label before S2; picture is its own owner.** The control is
a sibling `PictureTurn` and driver, not a mode of the text-swap driver (which
refuses a second submitted turn). The preview is the Point and Talk bubble
re-presented at the passage with plain-text Keep and Discard; nothing is durable
until Keep. An inline arm step carries the cost and privacy statement and doubles
as the mis-tap guard. Present-but-unavailable is rejected, consistent with the
earlier call: render nothing until a health read says `available`. Recorded
client rules the server must support:

- offer Try again only for 429, a 503 shed, or a brief refusal; a network error or
  our own timeout is ambiguous and non-retryable, unlike text swap;
- one picture in flight globally (the server admits three per window, two
  concurrent per instance);
- cancel copy is "Stop waiting", never "Cancel drawing", because a relay
  generation is not cancelled by the client;
- the accessible name must contain the visible text; alt text is a neutral
  truthful name in the person's locale, never the model-authored brief.

**S2 engine — one disagreement with this handoff, resolved.** The earlier S2
shape said "a text pointer". The audit rejects it: a pointer in text spends about
145 of the 2,000 code units, lasso would offer it as selectable language, and
Text Swap or Wiki could rewrite a hex run. The decided shape is an optional
`ThoughtNode.image`, with the fields of S1's `ImageResultMeta`
(`mediaType, byteLength, width, height, contentHash`). Width and height are
required so the missing-bytes box keeps its size. Three design flaws the audit
found are now part of the design: export currently runs "always from memory", so
the session needs a bounded in-memory byte cache; "missing bytes" is three states
(absent, damaged, unavailable), derived and never stored; and the handoff named no
bound on images per document, so the pointer's size field enforces one in the
tree validator.

Ordered slices (each ships green before the next):

1. tree and codec, dark: pointer, `replace-image`, codec round trip, history
   recovery whitelist — **built** (2026-10-12), no producer exists;
2. storage expand: database v7 with an empty `blobs` store, tolerant readers
   (stamp 1 and 2), writers dark; — **built** (2026-10-12);
3. archive binary entries plus the shared pure byte sniffer (extracted from
   `server/image-bytes.ts`, which imports `node:crypto`) — **built** (2026-10-12);
4. the availability projection and its surfaces in five locales — projection
   **built** (2026-10-12, `persistence/image-availability.ts`); the surfaces and
   their five-locale copy move into slice 5, because nothing renders a picture
   until the accept path exists and copy for an unrendered state is a claim about
   an unbuilt capability;
5. the accept path, the first producer, with the session byte cache and quota
   refusal — core **built** (2026-10-12) as 5a: the picture client, the turn
   reducer, the session cache and the Keep order, all dark; 5b-1 (a passage shows its
   picture or a same-size placeholder, with five-locale copy and a height cache
   that knows the picture) **built**; 5b-2 (archive export and import wired into
   the app, with the `missingImages` report) **built**; 5c-1 (the picture
   driver, the one-in-flight gate, and the health-gated availability read) **built**
   dark; 5c-2 (the control, the arm step, the preview, five-locale copy) **built**
   and unopened: it renders only when the health read says `available`;
6. compaction and the provenance sidecar.

Largest risk: rollback after v7 makes every document superseded in an older
build, images or not. That is accepted precedent (`virtual-file-system.md`) and
dark-first shipping is the mitigation; it belongs in the rollback plan.

### Freeze — serial and owner-selected

Only the integrator/freezer updates shared contracts. The recommended first
freeze candidate is one pure, deterministic, versioned material context
projection that can serve bounded AI adapters and a separate context receipt
without changing the tree or Archive.

Before that freeze, the owner must decide:

1. the receipt's human and machine purpose;
2. whether ordinary native Copy remains literal text;
3. the stored Inquiry-record migration for the three address kinds;
4. which identifiers may leave the device and which are receipt-local aliases;
5. how clipping, held-aside material, and exclusions remain explicit;
6. whether the first slice proves AI context, export, or both.

The freezer then records the standard five lines — Outcome, Boundary,
Invariants, Proof, Non-goals — in the active plan. A fresh verifier checks for
scope widening, a second source of truth, privacy leaks, current-capability
misstatements, and unfunded dependencies. Only a passing freeze may request an
implementation budget.

### Later build order — not authorized here

If later authorized, dependencies currently point to this order:

1. pure context projector;
2. context receipt and explicit Copy with context;
3. Inquiry and material-turn adapters consuming the same projection semantics;
4. transient lineage projection in the index and canvas;
5. main-product and Preview/demo Branch separation;
6. trusted desktop/local runtime proof;
7. generated-media asset lifecycle;
8. only then an Image control;
9. replicated computation only after its demand gate.

Shared foundations are built serially. Parallelism returns only where slices
have independent owners and no overlapping contract or persistence change.

## Agent organization and edit lanes

- **Human owner:** chooses the problem, accepts tradeoffs, promotes a candidate,
  and reopens product or governance decisions.
- **Integrator:** owns the decision ledger, source-of-truth audit, document
  ledger, agent briefs, and merge order. It does not manufacture consensus.
- **Researcher:** reads the repository and primary sources, runs a bounded probe
  when necessary, and returns evidence. It does not edit contract documents.
- **Freezer:** turns one selected conclusion into a reviewable five-line slice.
  It must not be the builder arguing for its own abstraction.
- **Builder:** exists only after implementation authorization, uses an isolated
  worktree, owns one vertical slice, and cannot widen its freeze.
- **Verifier:** independently reads the frozen contract and exact diff, then
  returns pass, revise with named gaps, or reopen with contrary evidence.

One integrator is the only concurrent writer to `product.md`, `principles.md`,
`material.md`, `architecture.md`, `protocol.md`, `changes.md`, or the active
plan. Research agents return memos rather than branches. Future builders own
separate worktrees and system boundaries; two branches that both alter a shared
contract are never auto-merged.

Every delegated packet includes:

```text
Base commit:
Outcome:
Question that can change the slice:
Allowed paths:
Forbidden paths:
Required repository evidence:
External primary sources:
Deliverable:
Stop condition:
Non-goals:
Validation:
Not authorized:
```

Every handoff returns:

```text
Status:     done / partial / blocked
Scope:      files and system boundary changed
Validation: exact checks run and not run
Risks:      concrete remaining failure modes
Next:       one executable step
```

## Research standard

Research begins with a repository unknown that can change the next slice. It
uses official documentation, source, releases, licences, and measured behavior
before commentary or comparison articles. Each reference is checked for whether
it solves the same problem, which principle is transferable, and which system
shape is not. The detailed source and comparison map lives in
[`reference/post-preview-research.md`](reference/post-preview-research.md).

A research packet must state current repository truth, alternatives, its
recommendation, important rejected paths, a minimal falsifiable probe, the
condition that would reverse the choice, and one of `promote`, `keep open`, or
`reject for now`. It stops when one implementable answer and its proof are
clear; it does not continue to accumulate projects.

## Documentation ledger

| Document | Planning-stage role |
| --- | --- |
| `product.md` | accepted purpose and long direction only |
| `principles.md` | durable product judgment only |
| `changes.md` | accepted form-changing decisions only, never proposals |
| `open.md` | candidate abilities and promotion conditions |
| this handoff | stages, ownership, dependencies, risks, and resume point |
| `reference/post-preview-research.md` | prior art, research questions, evidence and stop rules |
| `material.md` | unchanged until a durable material concept is selected |
| `architecture.md` | unchanged until ownership is frozen |
| `protocol.md` | unchanged until a strict cross-boundary shape exists |
| active plan | unchanged until the owner promotes one frozen slice |

## Risks and stop conditions

- Stop if a proposal makes a renderer, receipt, prompt envelope, provider, or
  asset index a second material authority.
- Stop if shared context widens a person's address or silently retrieves held,
  folded, sibling, prior-turn, or external material.
- Stop if a migration can silently discard stored Inquiry records.
- Stop if ordinary clipboard behavior begins sending structure without an
  explicit person action.
- Stop if local-model work weakens the web SSRF boundary or calls downloaded
  and evictable artifacts fully offline without a receipt.
- Stop if Image is treated as a label or API call rather than a reversible,
  persistent and exportable material lifecycle.
- Stop if collaboration infrastructure is justified only by another product's
  architecture rather than observed Matter use.
- Stop if a planning document presents a hypothesis as a current capability,
  release promise, open-source commitment, or implementation authorization.

## Decisions taken under delegation — 2026-10-12

The owner asked the maintainer to make reasonable decisions and report them.
Each can be reversed by saying so; none opens a paid or public surface.

1. **Spend and payer.** The image gate stays closed in production
   (`MATTER_IMAGE_ADAPTER=off`). The picture control is health-gated and renders
   nothing until a health read says `available`, so building it opens nothing.
   When opened, it is operator-funded and per-instance admitted; it does not open
   to the public before an edge rule and a provider budget exist (#34, #68).
2. **Child creation.** Branch stays in the main rail. Reopen only with a decided
   replacement, because removing it leaves no human path past level one.
3. **Picture control.** The arm step is always shown (it is also the mis-tap
   guard); waiting copy says "Stop waiting"; one picture in flight globally; a
   passage edited while drawing makes the picture stale; an arrived picture whose
   passage the person left is parked with Discard; the typed field is not a
   picture direction in v1; alt text is a neutral, truthful name in the person's
   locale. The five labels (zh-CN 绘图, zh-TW 繪圖, ja-JP 描く, en-US Draw, de-DE
   Zeichnen) stay provisional until a native speaker reviews them, and ship only
   behind the health gate.
4. **Release.** `claude/preview-65` is not merged to `main`: database v7 would
   reach production profiles immediately and cannot be rolled back without
   superseding every document. Security fixes went to `main` alone (PR #129). Cutting
   Preview.65 is a release decision with a deployment receipt, not a merge.
5. **L0.** Not started: the probe downloads a multi-gigabyte model and a binary,
   and a download is the owner's to approve.

## The owner's original intents, and where each stands — 2026-10-12

Kept here so a later reader can check that the plan still realizes what was asked,
including the earliest turns of the thread.

| Intent (owner's words, condensed) | State | Next slice |
| --- | --- | --- |
| Share coherence with the AI: the tree's relations, not loose files, reach every AI entry, with a short project-and-context framing | working projection is one tested function (built); pure `projectMaterial` and the Markdown receipt (grammar, digest, strict parser, `reference/context-receipt.md`) **built** dark (C1) | C2: wire one projection into Point and Talk and Ask Matter prompts with a fenced reference-data frame, behind an eval of prompt size and answer quality |
| Markdown that shows coherence, links and relations, not just files; an Atom/RSS-like receipt for machines | C1 defines the receipt grammar, with digest and strict parser | C2a **built**: an explicit "Copy with context" and "Receipt (.md)" download, five-locale copy; native Copy stays literal. C2b (AI entries read the same projection) was evaluated and **closed without a wire change**: on 6 structural questions x 3 runs, depth-ordered text answered 18/18 and the same prompt with each passage naming its parent answered 18/18 (`server/inquiry-structure.live.test.ts`, 2026-10-12), so the Inquiry wire keeps its shape; reopen only with a failing case, such as a large clipped tree or a selection whose relation matters |
| Left panel and canvas respond together; selecting a child lights the path to the root | index ancestor underline built; operation-time canvas line built | I0 slice B **built**: an operation-scoped root→target line on the canvas, only while Point and Talk, Elastic, a pending text swap or a paid picture owns a target (2 DOM elements; the 2,000-node receipt holds at 4507 elements) |
| Point and Talk gets 绘图 as plain text left of the black button; the generation API comes later | closed gate, server route, material lifecycle, canvas rendering, driver and gate built; control and preview in progress | 5c-2: the control, arm step and preview, health-gated and unopened in production |
| Branch overlaps Voice and belongs only to Preview | decision taken: stays until human child creation has another home | a decided replacement, then the Preview flag and the eight e2e specs |
| Croquet-style deterministic recompute; sync only the tree and its links; light trustworthy format | satisfied by design: the tree is the authority and every view is a projection; the receipt and archive are the portable formats | S0 only on observed cross-device demand |
| Local models and a desktop client, privacy-first, sovereignty over material | direction accepted, no capability claim; web keeps its SSRF boundary | L0: one headless probe, awaiting approval to download a model |
| Material outlives the model; Why Matter exists; long-term direction in the product docs | written in `product.md` and `principles.md` | none |
| Open-source posture | the repository is proprietary; local deployment, open formats and open source are three separate decisions | an open format first; licensing is a separate owner decision |

## Next owner decision (superseded where decided above)

Wave 1 and the S2 and image-control audits are done. Nothing here is a
Builder dispatch until the owner promotes a block. Ordered by what unblocks the
most, the proposed promotions are:

1. **C0 first slice** (`projectMaterial`, byte-equal, `material/` only): no
   product change, and it removes a test-only twin of production code.
2. **S2 slice 1** (pointer, `replace-image`, codec; dark): no storage, archive
   or UI, and no producer.
3. **L0 headless probe**: a maintainer script, no product claim.

Owed regardless: spend control before the image gate opens (issues #34 and
#68), who pays for pictures, where human child creation lives once Branch
leaves, and native review of the five control labels (zh-CN 绘图, zh-TW 繪圖,
ja-JP 描く, en-US Draw, de-DE Zeichnen are unreviewed).
