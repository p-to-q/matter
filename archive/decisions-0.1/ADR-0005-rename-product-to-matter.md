# ADR-0005: Rename the product to Matter

- Status: Accepted
- Date: 2026-08-02
- Supersedes: the naming and public path in ADR-0001

## Context

`Arrow` described the research mechanism but not the material experience. The
product now needs a name and line that communicate the consequence directly,
plus a useful first-load canvas rather than an empty demo setup.

## Decision

- Public product name: `Matter`.
- One-line: `Make thought matter.`
- Public base path: `/matter`.
- The initial scene contains one editable sample thought at revision zero.
- Internal `features/arrow`, protocol IDs, environment variables, and API routes
  remain unchanged in this slice to avoid a broad non-functional migration.

## Consequences

- A person can begin with lasso and stretch immediately.
- The sample is scene material, not onboarding chrome, and is not added to undo
  history.
- Public metadata, visible copy, docs, tests, and deployment routing use Matter.
- Internal names may be migrated later as one mechanical change with no product
  behavior mixed in.

## Review trigger

Revisit internal naming before a public SDK, external protocol publication, or
third-party integration makes those identifiers part of the product contract.
