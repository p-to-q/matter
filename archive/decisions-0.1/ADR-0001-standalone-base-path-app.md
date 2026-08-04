# ADR-0001: Standalone application at `/arrow`

- Status: Accepted
- Date: 2026-08-02

## Context

The original blueprint placed Arrow inside `p-to-q/site`. Arrow needs an
independent repository and deployment lifecycle while remaining available at
`ptoq.io/arrow`.

## Decision

Build Arrow as a standalone Next.js application. Configure `/arrow` as its
default base path and route the public host to that deployment. Borrow p-to-q
visual and repository discipline without importing site application code.

## Consequences

- Arrow can change and deploy independently.
- Shared branding is expressed through documented tokens rather than code
  coupling.
- The public host must configure path routing and preserve asset/API base paths.

## Alternatives considered

- Live inside `p-to-q/site`: rejected because release ownership is coupled.
- Use a separate subdomain: possible later, but `/arrow` is the intended public
  address.

## Review trigger

Revisit if host routing prevents APIs, static assets, or previews from working
reliably beneath a base path.
