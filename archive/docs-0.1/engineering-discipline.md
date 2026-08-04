# Engineering Discipline

<!-- Source note: adapted from p-to-q/repo-template/docs/engineering-discipline.md.
     Matter keeps the repository-first discipline and adds its active product and
     protocol boundaries. -->

This document defines how humans and coding agents change Matter.

## Core stance

Work as a careful maintainer. The goal is not more code; it is the smallest
correct change that fits Matter's interaction thesis, architecture, and demo
reliability.

## Before implementation

For non-trivial work, record in the active exec plan or PR:

1. the actual user-visible claim;
2. the smallest affected boundary;
3. constraints and behavior that must remain true;
4. the smallest valid solution;
5. validation to run;
6. explicit non-goals.

Read the smallest set of nearby code, tests, config, docs, and decisions that
defines that boundary. Repository truth overrides chat history and generic best
practice.

## Change discipline

- Make one coherent change at a time.
- Extend an active path before creating a parallel path.
- Avoid drive-by cleanup, formatting churn, dependency migration, and file moves.
- Do not invent public APIs, abstractions, dependencies, or requirements.
- Abstract only when two present call sites need the same stable concept.
- Prefer deleting unused machinery over preserving speculative flexibility.
- Keep diffs easy to review and roll back.

## Architecture discipline

- Keep business rules out of React components, route handlers, and provider glue.
- Keep framework entrypoints thin: parse, delegate, translate the result.
- Keep modules cohesive and interfaces narrow.
- Keep data flow explicit and side effects visible.
- Prefer composition and plain functions to service hierarchies.
- Avoid dumping grounds named `utils`, `helpers`, `common`, or `misc`.
- Prefer local reasoning to distributed indirection.

Matter-specific boundaries:

```text
browser interaction -> versioned envelope -> server adapter
-> validated ActionPlan -> private SceneMutation -> scene engine -> material UI
```

- Components do not call model providers.
- Providers do not receive DOM nodes or mutate scene state.
- Public agent actions remain smaller than the private reducer vocabulary.
- A generative command is not complete until its inverse is proven.
- Transient voice and pointer state never enters durable scene history.
- Fixture and live modes use the same browser, protocol, and reducer path.

## Code style

- Prefer clarity over cleverness and explicitness over magic.
- Use guard clauses when they flatten control flow.
- Keep functions focused and modules cohesive.
- Split a module when it mixes presentation, orchestration, transport, and policy.
- Comments explain reasons, constraints, or tradeoffs, not syntax.
- Avoid files that grow because unrelated behavior shares a framework hook.
- Treat roughly 250 lines as a review prompt, not a mechanical limit: a longer
  file must still express one cohesive idea.

## Robustness and failure handling

- Treat browser, HTTP, model, and persisted input as untrusted.
- Validate at every external boundary and again before scene mutation.
- Reject invalid plans atomically; never apply a partial result.
- Preserve meaningful diagnostics on the server without exposing provider errors.
- Keep retryable UI state local to the affected anchor or material.
- Make fallbacks explicit. Never silently turn a live request into fixture output.
- Bound audio size, recording duration, request duration, action count, text
  length, coordinates, and scene revision.
- Do not retain raw audio by default.

## Testing and validation

Preferred order:

1. narrow unit or protocol test;
2. type check;
3. lint;
4. production build;
5. fixture-mode browser flow;
6. visual review at target laptop and mobile widths.

Required evidence by boundary:

| Boundary | Minimum evidence |
| --- | --- |
| Scene mutation | forward result, exact undo, invalid atomic rejection |
| Protocol/schema | valid fixture plus malformed and stale input rejection |
| HTTP adapter | success and stable error envelope |
| Voice lifecycle | permission denial, stop, cleanup, retry |
| Visual interaction | rendered screenshot and pointer-only walkthrough |

Do not claim a check passed unless it ran. Say `Not run` and why when a check is
unavailable.

## Decision traces

Use the lightest durable trace that preserves why:

- PR note for a local reversible change;
- exec plan for multi-slice implementation;
- ADR for protocol, rendering, provider, privacy, deployment, license, or
  workflow decisions;
- research/source ledger when an external source changes implementation.

Chat is not a durable decision record.

## Demo reliability

The demo is a product surface, not a separate throwaway implementation.

- Deterministic fixture mode must exercise real scene and interaction code.
- The demo must not depend on typing, microphone hardware, or network access.
- Failure preserves the anchor or material and exposes a pointer retry.
- Freeze new capabilities before presentation hardening.
- Rehearse the deployed origin, browser permissions, target viewport, and undo.

## PR report

```text
Summary: what a person can do now.
Boundary: the smallest system surface changed.
Validation: exact commands and manual checks run.
Risks: behavior, compatibility, privacy, demo, docs.
Deferred: intentionally untouched work.
```
