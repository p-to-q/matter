# Architecture

## Deployment

Matter is an independent repository and deployment. `ARROW_BASE_PATH=/matter`
makes the standalone application available beneath `ptoq.io/matter` when routed
through the production host. It does not import from or build inside `p-to-q/site`.

## Runtime

```text
pointer + microphone
        ↓
BrowserVoiceAdapter
        ↓
POST /api/arrow/transcribe
        ↓
InteractionEnvelope
        ↓
POST /api/arrow/turn
        ↓
validated ActionPlan       public, bounded agent vocabulary
        ↓
planToSceneCommand
        ↓
SceneMutation[]            private, complete reversible vocabulary
        ↓
applySceneCommand
        ↓
DOM material + local SVG feedback
```

The separation between `CanvasAction` and `SceneMutation` is intentional. An
agent may propose creation, replacement, or branching, but it does not receive
internal deletion primitives. The reducer can still construct an exact inverse
command for undo.

## Current scope

This foundation includes:

- scene protocol, Zod schemas, action validation, and reversible history;
- mock and OpenAI-compatible server adapters;
- bounded MediaRecorder capture and local audio-level feedback;
- full-viewport ptoq-derived neutral visual system;
- anchor-local listening, planning, failure, creation, and undo states;
- deterministic fixture mode for testing and demos.

Semantic lasso, stretch degree, and in-place range replacement UI come next.
