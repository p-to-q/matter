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
});
