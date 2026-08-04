# ADR-0004: Discriminate create and transform turns

- Status: Accepted
- Date: 2026-08-02

## Context

The creation proof only needed an anchor. Elastic Language needs a semantic text
range and a normalized stretch constraint. Making all of these optional on one
envelope would permit ambiguous turns such as a transform with no selection.

## Decision

`InteractionEnvelope` becomes a discriminated union:

- `mode: create` requires an anchor;
- `mode: transform` requires a semantic text selection and stretch gesture.

Voice, context, client capabilities, validation, and scene revision remain
shared. DOM geometry is transient evidence; object ID and text offsets are the
durable reference.

## Consequences

- Server planners narrow input before reading anchor or selection.
- Invalid combinations fail at TypeScript and Zod boundaries.
- Future interaction modes must deliberately add another union member.

## Alternatives considered

- Optional anchor/selection/gesture fields: rejected because validation and
  provider prompts would depend on undocumented field combinations.
- Separate endpoints: rejected because creation and transformation share one
  bounded planning contract and adapter lifecycle.

## Review trigger

Revisit when another mode cannot share the voice, scene revision, context, and
ActionPlan lifecycle without conditional complexity.
