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
| Three Inquiry addresses | specified, not implemented | active plan | stored-record migration or explicit lossy mapping decision |
| Shared material context projection | working hypothesis | this handoff only | C0 research and an independent contradiction review |
| Context receipt | open candidate | `open.md` | purpose, privacy, format, clipping, and compatibility decisions |
| Lineage-aware index and canvas | open candidate | `open.md` | I0 interaction state table and accessibility proof plan |
| Main-rail Branch removal | open candidate | `open.md` | explicit Preview/demo composition boundary and replacement decision |
| Local/private intelligence runtime | accepted direction, no capability claim | `product.md`, `principles.md` | L0 device, security, integrity, cancellation, and offline receipts |
| Generated media as material | open candidate | `open.md` | M0 address, asset, undo, persistence, export, and privacy contract |
| Local lexical authority (Wiki) | shipped, record V7 | `reference/wiki.md`, `surfaces.md` | nothing to advance; it is the baseline C0 and L0 must read |
| Wiki settle inside a context receipt | open question raised here | this handoff only | whether a receipt carries only the canonical form or discloses that a settle occurred |
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

## Next owner decision

When a research budget returns, the owner may dispatch bounded Wave 1 with one
integrator and at most three read-only researchers. If only one packet is
affordable, start with **C0 — Context and receipt**, because it resolves the
shared semantic seam without choosing a provider, renderer, media model,
desktop shell, or sync system. Until that authorization, this handoff is
complete and no Builder should be dispatched.
