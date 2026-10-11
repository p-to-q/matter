/**
 * One latency lattice for Matter's model-backed surfaces.
 *
 * Each inner owner must settle before the next outer owner can turn the same
 * failure into an attributable product outcome. Platform durations are seconds
 * because that is the unit Next route declarations require.
 */
export const MODEL_DEADLINES = Object.freeze({
  repair: Object.freeze({
    providerMs: 8_000,
    routeMs: 9_500,
    clientMs: 11_000,
    authorityLeaseMs: 12_000,
    platformSeconds: 15,
  }),
  label: Object.freeze({
    providerMs: 12_000,
    routeMs: 14_000,
    clientMs: 16_000,
    platformSeconds: 20,
  }),
  inquiry: Object.freeze({
    providerMs: 16_000,
    routeMs: 18_000,
    clientMs: 20_000,
    platformSeconds: 25,
  }),
  transform: Object.freeze({
    providerMs: 12_000,
    routeMs: 14_000,
    clientMs: 16_000,
    platformSeconds: 25,
  }),
  textSwap: Object.freeze({
    providerMs: 12_000,
    routeMs: 14_000,
    clientMs: 16_000,
    platformSeconds: 25,
  }),
  /**
   * An image request runs two model calls in sequence inside one route: a text
   * step that turns the passage into a brief, then the renderer. Every other
   * surface has one provider call, so the route budget here must cover both
   * plus a margin, not just the longer of the two.
   *
   * Measured renderer latency was 11 to 30 seconds across a small sample, so
   * `providerMs` leaves about a third of headroom over the slowest observation.
   * That is a thin margin for a tail nobody has measured, and the whole lattice
   * is kept inside sixty seconds on purpose: a `maxDuration` above the
   * deployment plan's ceiling fails at deploy rather than at run time.
   */
  image: Object.freeze({
    briefMs: 8_000,
    providerMs: 40_000,
    routeMs: 50_000,
    clientMs: 53_000,
    platformSeconds: 60,
  }),
});
