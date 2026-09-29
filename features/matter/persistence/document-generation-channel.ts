const CHANNEL_NAME = "matter.document-generation.v1";

/**
 * A committed snapshot row, as other tabs need to know about it: which tree,
 * which write generation, and which storage schema wrote it. Never material.
 */
export type DocumentGeneration = Readonly<{
  treeId: string;
  writeGeneration: number;
  storageSchemaVersion: number;
}>;

export type DocumentGenerationChannel = Readonly<{
  publish(generation: DocumentGeneration): void;
  subscribe(listener: (generation: DocumentGeneration) => void): () => void;
  close(): void;
}>;

/**
 * Cross-tab invalidation for the material snapshot. Delivery is advisory: a
 * tab that misses a message still meets the newer row through its own CAS or
 * the read it performs when it becomes visible again.
 */
export function createDocumentGenerationChannel(): DocumentGenerationChannel {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return Object.freeze({
      publish: () => undefined,
      subscribe: () => () => undefined,
      close: () => undefined,
    });
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  const listeners = new Set<(generation: DocumentGeneration) => void>();
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const generation = parseGenerationMessage(event.data);
    if (generation === null) return;
    for (const listener of listeners) {
      try {
        listener(generation);
      } catch {
        // Invalidation is advisory; one observer cannot break the channel.
      }
    }
  };
  return Object.freeze({
    publish(generation) {
      if (!isGeneration(generation)) return;
      channel.postMessage(Object.freeze({
        version: 1,
        treeId: generation.treeId,
        generation: generation.writeGeneration,
        schema: generation.storageSchemaVersion,
      }));
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

function parseGenerationMessage(value: unknown): DocumentGeneration | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 4 || record.version !== 1) return null;
  const generation = {
    treeId: record.treeId,
    writeGeneration: record.generation,
    storageSchemaVersion: record.schema,
  };
  return isGeneration(generation) ? Object.freeze(generation) : null;
}

function isGeneration(value: Readonly<Record<string, unknown>>): value is DocumentGeneration {
  return typeof value.treeId === "string" &&
    value.treeId.length > 0 &&
    value.treeId.length <= 128 &&
    Number.isSafeInteger(value.writeGeneration) &&
    (value.writeGeneration as number) >= 1 &&
    Number.isSafeInteger(value.storageSchemaVersion) &&
    (value.storageSchemaVersion as number) >= 1;
}
