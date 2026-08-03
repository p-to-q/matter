# Matter

> Make thought matter.

Matter is a standalone browser experiment for `ptoq.io/matter`. It borrows the
typed boundaries of the original blueprint without living inside the ptoq site
repository.

The current vertical slice is deliberately narrow:

```text
sample language → rough lasso → voice direction + stretch degree → ActionPlan
                → validated in-place replacement → exact undo
```

The original voice-placement path remains available for creating another
thought. Fixture mode exercises both paths without microphone or network access.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000/matter`. Add `?demo=fixture` for a microphone-free
deterministic walkthrough.

The application defaults to mock transcription and planning. Copy
`.env.example` to `.env.local`, add `OPENAI_API_KEY`, and change the adapter
values to `openai` to exercise the live server routes.

## Checks

```bash
npm test
npm run typecheck
npm run build
```

## Boundaries

- React components never call providers directly.
- Server adapters return a versioned, validated `ActionPlan`.
- Agent actions are separate from internal reversible scene mutations.
- The scene store is the only durable mutation boundary.
- Raw audio is forwarded for transcription and is not persisted by Matter.
- The primary path requires pointer and voice, not a keyboard.

## Repository map

- [`docs/index.md`](docs/index.md) — active documentation route;
- [`docs/engineering-discipline.md`](docs/engineering-discipline.md) — required
  implementation discipline;
- [`decisions/`](decisions/) — accepted durable decisions;
- [`plans/active-elastic-language.md`](plans/active-elastic-language.md) — current
  slices and acceptance gates;
- [`WORKFLOW.md`](WORKFLOW.md) — lightweight human/agent handoff contract.

## Current limitations

- Protocol `0.1` and the UI are experimental.
- The production host still needs `/matter` path routing, rate limiting, privacy
  copy, and deployed microphone verification.
- Live provider behavior is optional; fixture mode is the reliable demo path.
- Touch-specific gesture tuning, persistence, and production hosting remain
  deferred.
