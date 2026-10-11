# Post-preview research map

Status: context, not contract. This note identifies primary sources and bounded
questions for the planning handoff in
[`../handoff-post-preview-direction.md`](../handoff-post-preview-direction.md).
It does not select a dependency, alter the first-release roadmap, or authorize
implementation.

## Transfer rule

A mature project is useful only when it makes one Matter decision clearer.
Research first checks whether the reference solves the same problem, then names
the principle worth borrowing and the system shape that must not be copied.
Source code is not copied into this proprietary repository during research.

Prefer official documentation, specifications, source, releases, licences, and
measured behavior. Record the accessed version or commit when it can drift. A
dependency candidate additionally needs its licence, transitive surface, update
and security owner, exit cost, and a reason the platform or local code is worse.

## Research matrix

| Track | Primary references | Learn | Do not copy or assume | Future proof artifact | Stop condition |
| --- | --- | --- | --- | --- | --- |
| Context projection and portable receipt | [Atom RFC 4287](https://www.rfc-editor.org/rfc/rfc4287.html), [JSON-LD 1.1](https://www.w3.org/TR/json-ld11/), [Mermaid](https://mermaid.js.org/intro/) | Explicit identity, update/version metadata, links, deterministic order, bounded content and clipping; one semantic projection feeding AI, receipt and diagram adapters | Atom XML as the product format; an RDF ontology in the core tree; Mermaid as source data, editor or import authority | Golden fixtures for Unicode, deep lineage, the three address kinds, clipping and deletion; stable bytes, validator, digest and readable projection | Parent, sibling order, address and exclusions survive without coordinates or hidden retrieval; AI and export stop rebuilding context independently |
| Local-first and later sync | [Local-first software](https://www.inkandswitch.com/essay/local-first/), [Automerge](https://automerge.org/docs/hello/), [Automerge local storage and sync](https://automerge.org/docs/tutorial/local-sync/) | Local copy authority, storage/network adapter separation, offline continuity, portable changes and snapshots | A CRDT today; Undo as a replication log; multi-writer collaboration as a presumed requirement; claiming local-first from IndexedDB alone | Two isolated copies replay the same versioned basis without silent loss; offline edit, restart, recovery and reconnect proof; corrupt or duplicate input fails closed | Explicit export or a single-writer path satisfies the observed need; CRDT selection waits for real concurrent-conflict samples |
| Local model runtime | [WebLLM](https://webllm.mlc.ai/docs/), [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [Ollama API](https://docs.ollama.com/api/introduction) | Browser worker and WebGPU constraints; trusted sidecar isolation; capability discovery; OpenAI-compatible transport; model acquisition, cache, cancellation and progress | Provider API vocabulary in Matter's domain; localhost as inherently trusted; high-end WebGPU as the product floor; generic tools or agent mutations | The same scenario corpus across a remote mock, one browser-local probe and one desktop sidecar, all returning the same strict result contract; cancellation, timeout, offline start, integrity and no-tree-leak proofs | One browser experiment and one desktop-local path satisfy the same contract and stated device floor; stop before an adapter zoo |
| Generated-media asset lifecycle | [Git LFS specification](https://github.com/git-lfs/git-lfs/blob/main/docs/spec.md), [C2PA 2.2](https://spec.c2pa.org/specifications/specifications/2.2/specs/C2PA_Specification.html) | Small deterministic asset pointers, content hash, size and media type; blobs separate from the tree; derivative and provenance vocabulary; integrity checking | Git filters or the Git LFS remote; full C2PA signing infrastructure in a first slice; binary or provider responses inside node text; a general media type system | One generated image completes propose, preview, accept, undo, redo, export and reimport; missing or corrupt blobs are diagnosable; deletion, quota, privacy and offline fixtures pass | Text material still opens when a blob is missing, hashes verify, Archive can carry accepted assets, and orphan cleanup plus reversal semantics are frozen before an Image control appears |
| Humane tools for thought | [Dynamicland introduction](https://dynamicland.org/2024/Intro/), [Croquet Model–View–Reflector](https://croquet.io/croquet/croquet/tutorial-2_1_model_view_reflector.html) | Visible and bodily computation; model/view separation; common ordered events with local view computation; use BCI only as inspiration to reduce intent-to-material distance | Dynamicland's physical infrastructure; Croquet's reflector and cloud snapshots as a local-first answer; deterministic replication of generative output; permanent mind-map chrome or aesthetic imitation | A complete journey proof: address material, perceive its lineage, inspect the exact AI context, receive one reversible change, and show that view state never enters material or history | The reference improves Matter's single rooted material and one perceivable change; otherwise archive it. Stop immediately if it requires a permanent panel or general graph editor |

## Croquet: which half transfers, and where it belongs

Croquet's transferable idea is not synchronisation. It is Model–View–Reflector:
one deterministic model, views that are pure projections of it, and a reflector
that orders events while holding no state, so every participant recomputes the
same model locally rather than receiving a rendered result.

Matter already satisfies that discipline. The tree engine is the only durable
mutation owner and every command has an exact inverse; the material index and
the canvas are two projections of the same tree; and `AGENTS.md` states that
transient pointer, audio, transcript, focus and fold state never enters the
material document or command history. That last line is precisely Croquet's rule
that view state must not contaminate the model.

So Croquet strengthens two tracks and does not justify a third:

- **C0** inherits it as an organising principle. "One bounded projection serving
  AI context, a receipt, and later diagram renderers" is model/view separation
  applied to a seam that currently has four independent projections.
- **L0** inherits the local half: a device recomputing a view from portable
  material is the local-runtime question, not a sync question.
- **S0** keeps replication only, and stays behind its observed-demand gate.

Filing Croquet solely under S0 would have blocked the half that transfers behind
a gate for the half that does not. The reflector, cloud snapshots, deterministic
replication of generative output, and treating Material Undo as a replication
log all remain explicitly out of scope.

## Wiki is the local-runtime baseline, not a greenfield

`reference/wiki.md` describes a shipped, origin-local, offline, learning lexical
authority with its own qualification command, permission actions, and a stated
boundary that it crosses no model, wire, archive, or history boundary. L0 must
begin from it rather than from a blank comparison of WebLLM, llama.cpp and
Ollama: Matter has already proven that a local capability can learn and apply a
decision inside its contracts, and the qualification pattern behind
`npm run qualify:wiki` is the precedent for how a local runtime would earn the
word "qualified" here.

Wiki also fixes one assumption C0 might otherwise make. Because Wiki settles a
heard form to a canonical one at ingress, and is by contract not a prompt
supplement, the material a prompt carries is already post-settle; there is no
hidden transform at prompt time. The residual question is only what a receipt
should say about a settled occurrence.

## Track activation

1. **P0 product truth, C0 context and I0 interaction** may run together because
   they are read-only and answer different questions.
2. **L0 local runtime** begins after C0 identifies the provider-neutral context
   and result boundary.
3. **M0 generated media** begins after C0 and L0 can state address, receipt,
   storage and execution ownership without changing the text tree by assumption.
4. **S0 replicated computation** begins only after observed cross-device or
   collaboration evidence. Reading about sync is not activation evidence.

## Decision-question card

Before research, fill one short card:

```text
Decision:
Unknown that can change it:
Current repository truth:
What this packet will not decide:
Primary sources (maximum three plus one counterexample):
Minimum falsifiable probe:
Success evidence:
Failure evidence:
Time and token box:
```

The default source-reading box is one focused pass. A later implementation
spike, when authorized, should fit one small disposable proof rather than a
product feature. Run at most two genuine alternatives for one question.

## Research receipt

Every packet returns:

```text
Status:       promote / keep open / reject for now / blocked
Question:     the one decision this evidence can change
Repository:   current owners, contracts and missing proof
References:   primary sources, version or commit, licence where relevant
Borrow:       transferable principle or mechanism
Do not copy:  mismatched goal, authority or infrastructure
Probe:        exact work performed and result
Contrary:     evidence that weakens the recommendation
Reopen when:  observable condition that justifies another pass
Next:         one decision or executable step
```

Research ends when a freezer can write one implementable outcome, boundary,
invariants, proof and non-goals. More examples, frameworks or architecture
diagrams are not progress after that point.

## Review gates

- **Product:** does the result improve a real human journey while the person
  keeps the handle?
- **Material:** is the rooted tree still the sole durable material authority?
- **Context and privacy:** is every included and excluded passage inspectable,
  bounded and free of prior-turn or hidden retrieval?
- **Protocol:** is any cross-boundary value strict, versioned and migration-safe?
- **Locality:** is local, offline or private demonstrated by the appropriate
  device, artifact and network receipt rather than inferred from topology?
- **Recovery:** can accepted work be reversed, persisted, exported and restored,
  and can partial or corrupt work fail without silent loss?
- **Repository:** did research avoid dependencies, copied source, secrets, user
  material and open-source framing?

The integrator records a conflict rather than smoothing it over. A verifier
then recommends promotion, a named revision, or reopening with contrary
evidence. Only the human owner promotes a packet into the active plan.
