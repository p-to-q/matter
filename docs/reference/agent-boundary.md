# Agent Boundary

Module: `features/matter/server/planner.ts`

## Problem

A model has to change a person's material without ever being in a position to
decide *what* to change. It also has to read a person's own writing as context,
which means that writing arrives at the model as untrusted input.

Concretely:

- the model must not choose the target node, the character range, or the action
  type;
- output must be schema-valid or rejected whole;
- length must follow the gesture, not the model's own sense of how much to say;
- text from the document must never be able to act as an instruction;
- provider errors must not reach the browser;
- swapping providers must not touch a single component.

## Prior art

**Structured output with strict JSON Schema.** Constrains generation to a shape
at decode time rather than hoping for it and parsing defensively. Removes an
entire class of failure.

**Validate-at-the-boundary discipline.** Schema-valid at decode time
still does not mean semantically valid — a range can be stale, a revision can
have moved — so the plan is validated again before mutation.

**Prompt-injection posture from tool-using agent design.** The relevant rule:
content encountered through a tool is data, never instruction. A person's own
notes are exactly this kind of content, and "it is the user's own text" is not a
reason to relax it — the text may have been pasted, dictated from something
read aloud, or written months earlier.

The rule is about a channel, not about an author, and that distinction is what
lets a question or a Text Swap direction be answered at all. Material is what a
person wrote on their page; an intent is the one bounded value they addressed to
Matter for this operation. Same author, different channel, and only the second is
allowed to direct anything — within the operation the gesture already fixed,
never over a rule. A Text Swap direction is bounded before it becomes a value,
by a normalizer that rejects control characters and more than one line; an
Inquiry question may use the bounded multiline form its composer exposes.
Neither becomes material.
The prompt renderer gives those blocks distinct labels and constructors so a
scenario cannot mix them accidentally. They still travel in one provider
message; this is prompt-level discipline, not a privilege boundary. Exact
scope, output shape, and mutation authority remain server-owned and
adjudicated. See `prompt-harness.md`.

**Capability-bounded action vocabularies.** Give an agent the smallest set of
verbs that can express the task. Everything not in the set is unreachable by
construction rather than blocked by a check.

## Chosen

**The model returns only text.** Not a plan, not an action, not a target.

```text
envelope (selection + gesture + lineage)
    → server builds instructions and material context
    → model returns { text: string }         ← the entire model output surface
    → server constructs the single replacement ActionPlan from the envelope
    → schema validation → revision check → bounded mutation
```

This is the load-bearing decision on this page. Because the plan is built from
the envelope rather than from the response, the model cannot name a different
node, widen a range, emit more than one action, or invent an action type — not
because those are rejected, but because there is no channel for them. Phase 2
must preserve this specified `0.2` boundary when the provider route is built.

**Degree comes from the gesture.** `targetCharacterRange(length, amount)`
converts the stretch into a character range, which enters the instruction as a
hard bound. The model is told how much to write; it does not decide.

**The prompt itself is shared.** The turn's prompt, budget, and answer
judgement are one scenario on the common spine in
[`prompt-harness.md`](prompt-harness.md), already compiled and tested as
`transform-harness.ts`. The route and planner remain gated; freezing the prompt
early is deliberate, because it decides what a person's material becomes.

**Document context is labeled.** Lineage text is passed as reference material
with an explicit statement that it is never instruction, and it is bounded by
the limits in [`../protocol.md`](../protocol.md).

**Providers live in one file.** `server/` is the only place a provider name
appears. Adapters are selected by environment variable, and mock, fixture, and
live adapters return the same validated shape through the same path.

**Failures are stated.** A fallback to fixture output is never silent. The error
codes are stable and the messages are written for the person holding the mouse,
not for a log.

## Rejected

**Letting the model emit an `ActionPlan` directly.** The obvious design, and how
most tool-calling integrations work. Rejected: it hands the model the choice of
target and scope, which is precisely the authority Matter withholds.
Validating a model-authored plan is strictly weaker than not accepting one.

**Multiple actions per turn.** Rejected for `0.2`. One turn is one perceivable,
undoable change. Batching would make undo ambiguous and would let a single
utterance restructure material a person is not looking at.

**Model-chosen output length.** Rejected — degree is the gesture's channel. If
the model decides length, the stretch becomes decorative.

**Streaming generated text into the material.** Rejected: text arriving
progressively into a place a person is pointing at makes the target move under
their hand, and a partially-applied change has no inverse until it finishes.

**Trusting document text because it is the user's own.** Rejected. Provenance
inside the tree is not verified, and the rule costs one sentence in a prompt.

**Retrying automatically on a bad plan.** Rejected. A failed turn preserves the
material and offers a pointer retry. Silent retries make cost and latency
unpredictable and hide a defect that should be visible.
