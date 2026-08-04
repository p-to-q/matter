# Project Surfaces

This table prevents experimental code from becoming an accidental promise.

| Surface | Status | Evidence | Notes |
| --- | --- | --- | --- |
| Scene protocol `0.1` | experimental | schema and reducer tests | May change before public release. |
| Scene engine | experimental | forward/undo/atomicity tests | Only durable mutation boundary. |
| Mock transcription/planner | experimental | fixture browser flow | Required demo fallback. |
| OpenAI server adapters | experimental | contract and manual integration checks | Server-only; requires configuration. |
| `/matter` canvas | experimental | visual and pointer walkthrough | Desktop-first research surface. |
| Lasso and stretch | stub | blueprint only | Next implementation slice. |
| Scene persistence | unsupported | none | Explicitly out of scope. |
| Public SDK | unsupported | none | Revisit after a second experience. |

Status meanings:

- `stable` — compatibility is promised;
- `experimental` — usable but compatibility may change;
- `internal` — not a public contract;
- `stub` — named but not implemented;
- `unsupported` — intentionally absent.
