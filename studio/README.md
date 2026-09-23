# Studio

`studio/` contains active, reproducible publication tooling that operates on the
real product but is not part of the Matter application. It may contain capture
or render orchestration, closed fixtures, release receipts, and editorial
source copy. It must not contain credentials, real user material, raw provider
answers, or an unreviewed recording.

The complete directory is excluded from deployment upload and Next.js output
file traces. `npm run check` audits that boundary. A future desktop or mobile
packager must apply the same exclusion and extend the audit before it can ship.

Current workspaces:

- [`film/`](film/) — the reproducible Matter film capture,
  renderer, tests, copy, and latest release receipt.

Each workspace must be self-contained enough to audit without requiring an old
take: source, fixtures, tests, editorial contract, operating documentation, and
the latest receipt stay together. Superseded media and receipts do not.
