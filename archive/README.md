# Archive

Superseded work. Kept so decisions can be traced, not so they can be followed.

**Nothing here is current.** If an archived document disagrees with `docs/`,
`docs/` is right. If you find yourself reading an archived document to answer a
question about how Matter works, the answer is in the wrong place and the
current documentation needs fixing.

## Contents

### `prototype-soft-input/`

The first prototype, built as `Soft Input` — a Vite single-file React
application exploring three interactions at once: scaling a sentence, pushing it
through a two-dimensional semantic field, and following a word into adjacent
concepts.

Kept because `CONCEPT.md` records the original research framing and because two
of its three experiments are still live candidates in
[`../docs/open.md`](../docs/open.md).

Superseded by: the current Next.js application, which took the first experiment
and dropped the playground framing.

### `decisions-0.1/`

Five ADRs from the first form of the product. The format was retired in the
`0.2` documentation refresh: one file per decision was heavier than the
decisions warranted, and the ceremony meant small decisions went unrecorded.

Their content is compressed into
[`../docs/changes.md`](../docs/changes.md), which is now where durable decisions
go. Four of the five decisions survive into `0.2` unchanged.

### `docs-0.1/`

The documentation layer written for the first form: a canvas of loosely placed
thoughts, a scene document, and a three-experiment framing. It drifted once the
product became one rooted tree with a punctuation-level address space.

Superseded by: [`../docs/index.md`](../docs/index.md).

### `plans-0.1/`

Two completed execution plans — the foundation, and the elastic language
interaction. Both carry completion receipts. They are the record of how the
`0.1` demo was actually built.

Superseded by:
[`../plans/active-tree-material.md`](../plans/active-tree-material.md).

## Rule

Archive rather than delete when the reasoning is worth keeping. Delete when the
content is only noise. Never leave a superseded document in the active tree
because it is "mostly still right" — that is how a documentation layer stops
being trusted.
