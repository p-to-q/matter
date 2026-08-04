# Contributing

Start with [`docs/product.md`](docs/product.md) and
[`docs/material.md`](docs/material.md), then read only the code, tests, and
architecture needed for the change. References are available in
[`docs/reference/`](docs/reference/index.md); they inform implementation but do
not become product constraints by being present.

Before a non-trivial change, state:

- what a person can do afterwards;
- the smallest boundary affected;
- what must remain true;
- validation and explicit non-goals.

Keep one coherent change per pull request. Avoid unrelated refactors, dependency
upgrades, file moves, and speculative abstractions. A dependency needs a short
note in the relevant reference or pull request explaining why platform or local
code is worse. Durable product, protocol, storage, privacy, or deployment
decisions get a short entry in [`docs/changes.md`](docs/changes.md).

The active plan moves through research → freeze → build and proof. Research only
unknowns that can change the current slice. A frozen choice reopens only for
test, browser, measurement, provider, or product evidence; record that evidence
where the choice already lives. Do not create a phase document or design the
phase after next.

Run the narrowest relevant test first. Before merging, run:

```bash
npm run check
npm run test:e2e
```

For interaction work, also walk the fixture without a keyboard and check a
laptop and narrow viewport. Never report a check as passing unless it ran;
`Not run` with a reason is complete.

When stopping, report:

```text
Status:     done / partial / blocked
Scope:      what changed
Validation: exact commands run and not run
Risks:      what may still be wrong
Next:       one concrete step
```
