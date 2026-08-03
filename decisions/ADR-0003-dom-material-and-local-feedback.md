# ADR-0003: Render text as DOM material with local visual feedback

- Status: Accepted
- Date: 2026-08-02

## Context

Arrow's first material is language. It needs reliable wrapping, measurement,
selection semantics, readable typography, and feedback attached to the affected
location.

## Decision

Render durable thought text in the DOM. Render local anchors, paths, and future
selection feedback with CSS and SVG synchronized to the same coordinate model.
Do not add a canvas or whiteboard SDK for the first proof.

## Consequences

- Typography and accessibility remain first-class.
- The project owns pointer coordinates, overlays, and history behavior.
- Large-scene optimization is deferred.

## Review trigger

Revisit after a second non-language material type or measured DOM/SVG performance
failure.
