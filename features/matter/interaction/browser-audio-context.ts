type WebkitAudioContextWindow = Window & Readonly<{
  webkitAudioContext?: typeof AudioContext;
}>;

/**
 * Resolves the browser decoder/meter constructor without constructing it.
 * Older iOS WebKit builds can expose only the prefixed name even though they
 * already support MediaRecorder, so capability checks and actual use must
 * consult the same source.
 */
export function browserAudioContextConstructor(): typeof AudioContext | undefined {
  if (typeof AudioContext !== "undefined") return AudioContext;
  if (typeof window === "undefined") return undefined;
  return window.AudioContext ??
    (window as WebkitAudioContextWindow).webkitAudioContext;
}
