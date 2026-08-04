# Project Brief

## Thesis

Matter studies whether reference, degree, and structure can move out of a prompt
box and into pointer, gesture, voice, and space.

The first proof is Elastic Language: voice gives semantic direction, gesture
gives degree, and the result changes the indicated language in place.

## Current claim

The opening thought is immediately present. A person can roughly circle part of
it, speak a semantic direction, stretch for degree, receive an in-place change,
and undo to the exact previous sentence without a keyboard.

## Audience

- people evaluating the interaction proposition;
- p-to-q researchers and maintainers;
- contributors hardening the selection and stretch layer.

## Current boundary

Standalone Next.js application deployed beneath `ptoq.io/matter`, with a
provider-neutral browser/API/scene boundary. It does not live inside
`p-to-q/site`.

## Non-goals for this slice

- general whiteboard editing;
- branch relationships;
- scene persistence, accounts, collaboration, mobile parity;
- realtime spoken assistant replies or text-to-speech;
- a public SDK or plugin system.

## Completion signal

Fixture mode completes the full pointer path without microphone or network, live
adapters can replace mock adapters without UI changes, every committed action is
undoable, and the interface remains quiet at a common laptop viewport.
