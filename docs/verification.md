# Verification

Record only checks that actually ran.

## Latest local check

2026-08-02 Matter and Elastic Language checks:

```text
npm run doctor       PASS
npm run check:docs   PASS
npm test             PASS — 43 tests across 13 files
npm run typecheck    PASS
npm run lint         PASS
npm run build        PASS — webpack production build
npm run test:e2e     PASS — Chromium fixture flows 5/5
fixture creation     PASS — sample preserved, create, exact pointer undo
fixture transform    PASS — lasso, voice state, stretch, replace, exact undo
fixture document     PASS — related child node, hierarchy context, exact undo
fixture movement     PASS — frameless drag and exact position undo
canvas viewport      PASS — trackpad pan and pinch-zoom around the pointer
visual review        PASS — 1440 × 900 and 390 × 844, no page/console errors
base-path probe      PASS — `/matter` 200; retired `/arrow` 404
```

Known external checks:

- live transcription and planning require a configured server API key;
- microphone permission must be tested on the deployed HTTPS origin;
- GitHub Actions is not verified until the repository is published and the
  workflow runs there.
- Next 16 Turbopack panics when this checkout path contains Chinese characters.
  Repository scripts deliberately use webpack until the upstream UTF-8 path bug
  is fixed; this does not change the application architecture.
- `npm audit --omit=dev` reports three high-severity advisories through the
  current latest stable Next.js package: bundled PostCSS `8.4.31` and optional
  Sharp `<0.35.0`. npm's proposed fix is a destructive downgrade to Next 9.3.3,
  so it was not applied. Recheck when Next publishes compatible patched
  dependencies; do not process attacker-supplied CSS or images in the meantime.
- Live OpenAI transcription/planning was not run because no project API key was
  configured. Server boundaries compile and mock/fixture behavior is tested.
