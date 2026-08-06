# Matter

> Make thought matter.

Matter is an environment where thought becomes touchable material. Voice admits
human thought and gives generative direction. Gesture identifies material and
degree. A rooted tree keeps lineage. AI appears only as a local, reversible
change to material.

## State

The running `0.2` pre-release surface is one rooted spatial thought tree with
exact undo, focus, folding, derived geometry, a contextual editing instrument,
fixture voice admission, punctuation lasso selection, shared stretch degree, and
local Markdown durability through IndexedDB. The selected-language projection is
visual only: the original text DOM remains the source for ranges, copying, and
accessibility.

Still gated: the live transcription adapter, generative transform envelope,
explicit ZIP/directory export/import, and deployed-origin receipts. The retired
hackathon prototype is retained only under `archive/`.

See [`docs/surfaces.md`](docs/surfaces.md) for the exact boundary and
[`plans/active-tree-material.md`](plans/active-tree-material.md) for the migration.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000/matter`. Tests use a deterministic fixture adapter;
production leaves transcription unavailable unless a server-side live adapter is
configured and its deployment gates are proven.

```bash
npm run check
npm run test:e2e
```

## Read

- [`docs/product.md`](docs/product.md) — the product and interaction grammar;
- [`docs/material.md`](docs/material.md) — node, segment, tree, lineage, snapshot;
- [`docs/architecture.md`](docs/architecture.md) — system boundaries;
- [`docs/index.md`](docs/index.md) — everything else, by need.

Matter is a standalone Next.js application for `ptoq.io/matter`. Provider code
is server-only, the model returns text rather than plans, only the tree engine
mutates durable material, and every generative change has an exact inverse.

Apache-2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).
