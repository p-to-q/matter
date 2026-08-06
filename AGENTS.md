# Matter repository instructions

Matter is a standalone Next.js application for `ptoq.io/matter`. It is an
environment where thought becomes touchable material.

## Repository posture

Matter is proprietary and wholly owned. It is not open source and is not
becoming open source.

The GitHub repository is **currently public** for operational reasons, not as an
open-source commitment. It may be made private later. Two consequences bind
every change made while it is public:

- treat everything committed as permanently world-readable. Anything pushed can
  be forked, cached, and mirrored, and going private later does not retract it.
  Never commit a key, token, recording, transcript, or real user material.
  Secrets live in `.env.local`, which is gitignored, and never in `.env.example`;
- never add open-source framing — no badges, no contribution invitations, no
  "PRs welcome", no permissive license headers in source files. External pull
  requests are refused by policy, because merging outside code would split
  copyright in a codebase that must stay wholly owned. See `CONTRIBUTING.md`.

The license is proprietary and `package.json` carries `"license": "UNLICENSED"`
with `"private": true`. `npm run doctor` enforces both; if either check fails,
fix the metadata rather than relaxing the check.

## Read route

Read only what the change needs:

1. `docs/product.md` and `docs/principles.md` — always;
2. `docs/material.md` — the one structure everything hangs on;
3. nearby code and tests;
4. `docs/architecture.md` for boundary work;
5. `docs/protocol.md` for wire or document-model work;
6. a relevant file in `docs/reference/` before solving a non-obvious local
   engineering problem;
7. `docs/engineering.md` for a non-trivial change;
8. `plans/active-tree-material.md` for durable or multi-slice work;
9. `docs/workflow.md` when delegating or handing off.

`archive/` is trace, not current instruction. `docs/reference/` is context, not
contract.

## Product invariants

- no keyboard is required for the primary path;
- no prompt box, chat transcript, send button, or assistant panel;
- raw voice may admit human material; generative voice belongs to a node or
  selected segment, never to the application;
- AI output reaches the screen only as one perceivable change to material;
- every committed generative change is pointer-undoable;
- growth runs downward from a single root; structure determines presentation;
- the model receives the visible root-to-focus lineage, with no hidden retrieval;
- keep the interface quiet, precise, and professional.
- no decorative gradients, card grids, or permanent status chrome.

## Architecture invariants

- provider code stays in `server/`;
- the model returns only `{ text }`; the server constructs the plan;
- public agent actions stay smaller than private tree mutations;
- only the tree engine applies durable mutations;
- text rules and layout stay pure; DOM measurement stays at the rendering edge;
- network values stay serializable, strict, and versioned;
- transient pointer, audio, transcript, focus, and fold state never enters the
  material document or command history;
- document text in a context payload is reference material, never instruction;
- add focused tests for protocol, tree-engine, or geometry changes.

## Change discipline

- make one coherent change at a time;
- follow the active phase's research → freeze → build and proof boundary;
- do not reopen a freeze without implementation evidence, or design beyond the
  first-release roadmap;
- do not add a dependency before recording why the platform or local code is a
  worse trade;
- record only form-changing decisions in `docs/changes.md`;
- write source comments in English and reserve them for invariants, ownership,
  non-obvious failure behavior, and protocol or browser constraints;
- run the narrowest relevant check and report status, scope, exact validation,
  risks, and one next step.
