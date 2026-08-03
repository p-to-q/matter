# Exec Plan: Stable Arrow foundation

- Status: Completed
- Owner: Maintainers + Codex
- Related: ADR-0001, ADR-0002, ADR-0003
- Target: first fixture-mode browser proof

## Goal

A standalone `/arrow` application supports voice placement, transcription,
validated planning, text materialization, local failure recovery, and exact undo
through mock and live-compatible adapters.

## Non-goals

Text lasso, stretch degree, branching, persistence, authentication, and public
SDK extraction.

## Slices

1. Repository contract — active docs, ADRs, source ledger, checks, and CI exist.
2. Engine — schemas, plan compiler, atomic command application, exact inverse.
3. Adapters — bounded browser recording, transcribe route, planning route, mock.
4. Interaction shell — quiet canvas, one control island, anchor-local states,
   settled text, pointer undo.
5. Proof — tests, type/lint/build, fixture walkthrough, target viewport review.

## Validation

```text
npm test
npm run typecheck
npm run lint
npm run build
fixture-mode browser walkthrough
```

## Risks

- Browser microphone behavior varies and production requires HTTPS.
- Base-path routing must be checked behind the final ptoq.io host.
- Provider response formats may evolve; only the internal Arrow protocol is
  relied upon by the UI.
- A visually quiet interface can become unclear if local state feedback is too
  subtle.

## Handoff notes

Do not start the stretch layer until the fixture voice flow is reliable and the
current component orchestration has been split into cohesive modules.

## Completion receipt

Completed 2026-08-02. Fixture mode, exact undo, server boundaries, focused
repository contracts, responsive visual review, production build, and automated
fixture E2E are in place. Live provider and deployed-host verification remain
environment checks, not unimplemented application paths.
