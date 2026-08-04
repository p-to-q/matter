export type PointerSample = Readonly<{
  clientX: number;
  clientY: number;
}>;

type CoalescedPointerEvent = PointerSample & Readonly<{
  getCoalescedEvents?: () => readonly PointerSample[];
}>;

/**
 * Owns browser coalescing fallbacks and always preserves the dispatched event.
 * Pointer-up may be newer than the history returned by getCoalescedEvents().
 */
export function lassoPointerSamples(
  event: CoalescedPointerEvent,
): readonly PointerSample[] {
  if (!isFiniteSample(event)) return Object.freeze([]);
  if (typeof event.getCoalescedEvents !== "function") {
    return Object.freeze([ownSample(event)]);
  }
  try {
    const coalesced = event.getCoalescedEvents().filter(isFiniteSample);
    const samples = coalesced.map(ownSample);
    const final = samples.at(-1);
    if (final?.clientX !== event.clientX || final.clientY !== event.clientY) {
      samples.push(ownSample(event));
    }
    return Object.freeze(samples.length === 0 ? [ownSample(event)] : samples);
  } catch {
    return Object.freeze([ownSample(event)]);
  }
}

function isFiniteSample(sample: PointerSample): boolean {
  return Number.isFinite(sample.clientX) && Number.isFinite(sample.clientY);
}

function ownSample(sample: PointerSample): PointerSample {
  return Object.freeze({ clientX: sample.clientX, clientY: sample.clientY });
}
