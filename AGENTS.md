# Matter repository instructions

Matter is a standalone Next.js application intended for `ptoq.io/matter`.

Read the smallest relevant route before changing it:

1. `README.md` and `docs/project-brief.md` for product scope;
2. `docs/engineering-discipline.md` for every non-trivial change;
3. nearby code and tests;
4. `docs/architecture.md` for boundary work;
5. a related ADR and `plans/active-elastic-language.md` for durable or
   multi-slice work;
6. `WORKFLOW.md` when delegating or preparing a handoff.

Product invariants:

- no keyboard is required for the primary interaction;
- no prompt box, chat transcript, send button, or assistant panel;
- voice belongs to a canvas anchor or selected material;
- AI output changes canvas material through a validated `ActionPlan`;
- every committed generative change is pointer-undoable;
- keep the interface quiet, precise, and professional;
- do not add decorative gradients, card grids, or permanent status chrome.

Architecture invariants:

- provider code stays in server adapters;
- agent actions and internal scene mutations remain separate;
- only the scene engine applies durable mutations;
- network protocol values remain serializable, strict, and versioned;
- add focused tests for protocol or scene-engine changes.

When stopping, report status, scope, exact validation, risks, and one next step.
