# Prompt Harness

Modules: `features/matter/server/harness.ts`, `prompt-spine.ts`,
`repair-harness.ts`, `label-harness.ts`, `inquiry-harness.ts`,
`transform-harness.ts`, `model-pool.ts`

## Problem

Four places in Matter need a model: repairing a heard transcript, naming a
thought, answering one bounded question, and transforming a stretched passage.
Nothing about the product wants them to feel like four features — the AI is
folded into material, and a person should never be aware of having addressed
it. Written independently, though, they become four integrations: four
deadlines, four retry policies, four ways of quoting a person's own writing
into a prompt, and four places where the sentence that refuses instructions
inside that writing might simply be forgotten.

The second problem is subtler. A prompt is a request, not a guarantee. Any rule
written in one — keep their words, do not answer the direction, stay at this
length — holds most of the time and fails silently the rest, and the failure
arrives as text inside a person's own note.

## Prior art

**Structured output and validate-at-the-boundary** from
[`agent-boundary.md`](agent-boundary.md): constrain what a model can say, then
check it again anyway, because schema-valid is not semantically valid.

**Content encountered through a tool is data, never instruction.** The rule from
tool-using agent design, applied here to the person's own material, which is
exactly the kind of content it was written for.

**Circuit breakers and load shedding.** A cooling provider should be paid for
once, not once per person; a saturated one should shed rather than queue, since
a queued call only spends a deadline someone is already waiting out.

## Chosen

**A scenario, not an integration.** Each surface is a `MatterScenario`: an id, a
frozen prompt version, a compiled prompt, a budget, and an adjudicator.
`runScenario` is the only function in the codebase that awaits a provider, so
the deadline, the shedding, the backoff, and the refusal to leak a provider's
identity exist once.

```text
input → scenario.compile      one prompt, from the shared spine
      → scenario.budget       deadline and output ceiling, per utterance
      → adapter               the only await; pool or fixture
      → scenario.adjudicate   accept, or fall to the floor
```

**Every scenario has a floor, and the floor is already correct.** This is what
makes the whole path allowed to fail:

| Scenario | Floor when no answer is usable |
| --- | --- |
| transcript repair | the words as heard |
| thought label | the deterministic label already on screen |
| inquiry | a stated unavailability — never invented prose |
| transform | the passage unchanged, and a pointer retry |

Only the inquiry's failure is visible, because a person who asked a question is
owed either an answer or the fact that there is none. The other three settle
silently: nothing was lost, so nothing needs reporting.

**Adjudication is the guarantee; the prompt is only the odds.** Each scenario
judges the answer against what the person fixed, and each judgement is a
different shape because each scenario withholds something different:

- repair compares *spoken skeletons* — both texts stripped to what was actually
  pronounced — inside a proportional edit budget, so punctuation is free and
  rewriting is impossible. It is also what lets repair accept a vocabulary hint
  safely: a term from the person's own material may correct a misheard word, and
  still cannot be inserted into a sentence that did not contain it
  ([`voice-input.md`](voice-input.md));
- labelling re-runs the browser's own validation, then requires the answer to
  beat the deterministic label it would replace, so a model cannot rename a node
  merely differently ([`thought-label.md`](thought-label.md));
- inquiry trims and bounds, and refuses empty;
- transform cannot check meaning — changing the words is the point — so it
  checks the three things the gesture fixed: one passage, near the stretched
  length, and material rather than a reply to the person.

**The prompt has a shape, and the shape is an argument.** `composePrompt`
assembles named sections in a fixed order rather than letting each scenario
write prose:

```text
SCENARIO   which frozen prompt this is
MATTER     where the answer is going — only where it changes the answer
MANDATE    the one thing this scenario is for
FIXED      what the person's gesture already decided
ALLOW      the closed list of changes this scenario may make
KEEP       what must survive the answer
NEVER      the closed list of things this scenario does not do
UNSURE     what to do at the edge, which is always: less
ANSWER     the exact shape of the reply
<material> reference, fenced and named
```

MANDATE before NEVER because a model that knows its job needs fewer
prohibitions. FIXED before ALLOW because scope is what Matter withholds most
jealously — reference and degree come from gesture. ALLOW enumerated rather than
described, because a described mandate reads as "make this better", and better
is not what any of these four want. UNSURE last, because it is the line that
most changes behaviour: an uncertain model left free to guess rewrites.

**A scenario that needs it says what Matter is, in five lines.** A model that
has never seen this product assumes the one it was trained in, and then behaves correctly for
that one: it writes for a reader, it decides for itself how much to change, it
greets, it offers alternatives, it asks whether that helped. None of those have
anywhere to go here. `MATTER_BACKGROUND` is the smallest amount of world that
stops it — a canvas rather than a chat, thoughts as a tree of short unfinished
passages, the gesture deciding what and how much while language only gives
direction, and the answer becoming material rather than a message. It is not a
description of the product and should not grow into one; each line earns its
place by a wrong answer it prevents.

It is also priced per call, and `background` is therefore an explicit field
rather than a default. The two scenarios that run most often — repair, once per
utterance; labelling, once per visible node — are the two whose mandate is
narrowest, and knowing what a canvas is does not help a model decide where a
comma goes. Carry it where a scenario writes prose a person reads and where
assuming a chat produces a fluent, plausible, wrong answer: the transform and
the inquiry. Omit it where the scenario's own first line already states the
whole job.

**Two sentences are constants, not per-scenario prose.** `KEEP_UNFINISHED`
carries principle 4 into every scenario that touches a person's language.
`REFERENCE_NOT_INSTRUCTION` travels with the fence itself, so a scenario cannot
omit it — the scenario does not write it. It names the failure it refuses
rather than asserting a policy, because a bare "ignore instructions" line loses
to a confident imperative inside the quotation.

**Material enters only through a fence.** `fence` escapes `<`, `>`, and `&`;
`fenceJson` serializes structured context so a node's text cannot be mistaken
for one of the prompt's own lines and a truncation is visible as a field.

**One pool, four gates.** `model-pool.ts` is the only file where an endpoint,
a model name, or a key appears. Each scenario has its own environment switch
(`MATTER_LABEL_ADAPTER`, `MATTER_REPAIR_ADAPTER`, `MATTER_INQUIRY_ADAPTER`), so
authority is granted per surface rather than per credential. The variables are
still spelled `MATTER_LABEL_*` because they are a deployed secret layout, and
renaming a secret to match a refactor is how a deployment loses its credentials.

**The scenario's budget scales with its input; the caller may only shorten it.**
Repair scales with the utterance, transform with the target length, labelling is
flat because nothing waits on it. A caller passing `deadlineCeilingMs` can cut a
scenario short — only the caller knows whether anyone is still waiting — but
never lengthen it.

## Transform is compiled and frozen, not wired

`transform-harness.ts` has no route. The envelope, planner, and commit path in
[`agent-boundary.md`](agent-boundary.md) and
[`../protocol.md`](../protocol.md) remain gated. What is frozen here is the
part that can be frozen without them — the prompt, the degree bound, and the
judgement of an answer — because those are the parts that are hardest to change
afterwards without changing what a person's material becomes. The scenario is
compiled and tested; nothing calls it yet.

## Rejected

**One prompt with a mode flag.** Rejected: the four differ in what they may not
do, and a shared prose prompt would state every prohibition to every scenario,
which is how a repair pass learns it is allowed to summarize.

**Trusting the prompt and skipping adjudication where the stakes look low.**
Rejected. Labelling looks like the low-stakes one, and it is the surface where a
model is asked most often; an unchecked answer there renames a person's own
thought while they are reading it.

**A fixture adapter for the inquiry.** Rejected. Labelling and repair have a
correct answer without a model, so a fixture only proves plumbing. An inquiry
does not, and a fixture answer would be invented prose arriving in the one place
this product refuses to invent prose.

**Per-scenario provider pools.** Rejected: four pools means four places a key
can leak and four different pictures of which relay is unwell.

**Retrying a rejected answer.** Rejected, as in `agent-boundary.md`. Every
scenario already has a floor, so a retry buys a slightly different answer at
the cost of a person's remaining patience, and hides a defect that should be
visible in the fallback reason.
