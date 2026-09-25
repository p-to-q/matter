const CHANNEL_NAME = "matter.wiki-generation.v1";

export type WikiGenerationChannel = Readonly<{
  publish(generation: number): void;
  subscribe(listener: (generation: number) => void): () => void;
  close(): void;
}>;

/** Cross-tab invalidation carries one number and never lexical content. */
export function createWikiGenerationChannel(): WikiGenerationChannel {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return Object.freeze({
      publish: () => undefined,
      subscribe: () => () => undefined,
      close: () => undefined,
    });
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  const listeners = new Set<(generation: number) => void>();
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (!isGenerationMessage(event.data)) return;
    for (const listener of listeners) {
      try {
        listener(event.data.generation);
      } catch {
        // Invalidation is advisory; one observer cannot break the channel.
      }
    }
  };
  return Object.freeze({
    publish(generation) {
      if (!Number.isSafeInteger(generation) || generation < 1) return;
      channel.postMessage(Object.freeze({ version: 1, generation }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      listeners.clear();
      channel.close();
    },
  });
}

function isGenerationMessage(value: unknown): value is Readonly<{
  version: 1;
  generation: number;
}> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 &&
    record.version === 1 &&
    Number.isSafeInteger(record.generation) &&
    (record.generation as number) >= 1;
}
