# ADR-0002: Separate public agent actions from private scene mutations

- Status: Accepted
- Date: 2026-08-02

## Context

An agent should have a bounded creative vocabulary. Exact undo requires a more
complete internal vocabulary, including removal and restoration operations that
should not automatically be exposed to providers.

## Decision

`CanvasAction` is the public, validated proposal contract. The scene engine
compiles a plan into private `SceneMutation` values and produces an inverse
command during application.

## Consequences

- Providers cannot directly request internal deletion primitives.
- Undo is complete and testable.
- Protocol planning and reducer implementation can evolve independently, with an
  explicit compiler boundary.

## Alternatives considered

- Use one action union for planning and undo: rejected because it either cannot
  express exact inverses or overexposes reducer power.
- Store a full scene snapshot per change: simple but wasteful and less explicit;
  acceptable only as a temporary recovery mechanism if future mutations become
  too complex.

## Review trigger

Revisit if compound operations or persistence make inverse compilation
unreliable or if a public action truly requires deletion semantics.
