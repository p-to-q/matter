# Exec Plan: Matter Elastic Language interaction

- Status: Completed
- Owner: Maintainers + Codex
- Related: ADR-0002, ADR-0003, ADR-0004, ADR-0005
- Target: pointer-only fixture transformation proof

## User-visible claim

A mouse user can roughly circle part of a thought, control the degree by dragging
the selection body, speak a semantic direction, receive an in-place replacement,
and undo back to the exact prior thought.

## Smallest affected boundaries

- interaction protocol: create and transform envelopes;
- deterministic selection geometry and stretch normalization;
- selection-local voice lifecycle and planner result;
- DOM token rendering plus SVG selection feedback.

## Preserved behavior

- existing voice creation path and fixture mode;
- provider-neutral server boundary;
- exact scene undo and atomic plan validation;
- quiet ptoq-derived visual system and no-keyboard primary path.

## Non-goals

Branching, multi-object selection, touch/pinch, pan/zoom, persistence, realtime
transcription, text editing, and model streaming.

## Slices

1. Protocol — create/transform invalid combinations are unrepresentable.
2. Geometry — token segmentation, approximate lasso, merged rects, stretch clamp.
3. Interaction — lasso ink, selection body, handles, local voice state.
4. Planner — bounded in-place replacement in live and deterministic adapters.
5. Proof — exact undo tests, create regression, transform E2E, visual review.

## Validation

```text
npm run doctor
npm run check:docs
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
desktop and narrow visual walkthrough
```

## Risks

- DOM token geometry can drift after resize; the first version clears selection on
  viewport changes instead of pretending stale rects are valid.
- Microphone permission can resolve after a short drag; the stable flow starts
  listening before degree manipulation.
- Approximate lasso must remain forgiving without crossing unrelated lines.

## Completion receipt

Completed 2026-08-02. Matter opens at `/matter` with the sample thought as
revision zero. Fixture-mode creation and lasso–stretch transformation both pass
in Chromium, including exact undo. Desktop and narrow rendering preserve the
quiet paper field without browser console or page errors. Live provider and
deployed-host verification remain environment checks.
