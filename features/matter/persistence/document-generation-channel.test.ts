import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocumentGenerationChannel, type DocumentGeneration } from "./document-generation-channel";

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  readonly messages: unknown[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  closed = false;

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(value: unknown) {
    this.messages.push(value);
  }

  close() {
    this.closed = true;
  }

  receive(value: unknown) {
    this.onmessage?.({ data: value } as MessageEvent<unknown>);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeBroadcastChannel.instances = [];
});

describe("document generation channel", () => {
  it("carries only the tree, generation, and schema of a committed row", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const channel = createDocumentGenerationChannel();
    const native = FakeBroadcastChannel.instances[0]!;
    const received: DocumentGeneration[] = [];
    channel.subscribe((generation) => received.push(generation));

    channel.publish({ treeId: "tree_1", writeGeneration: 4, storageSchemaVersion: 1 });
    channel.publish({ treeId: "tree_1", writeGeneration: 0, storageSchemaVersion: 1 });
    channel.publish({ treeId: "", writeGeneration: 5, storageSchemaVersion: 1 });
    expect(native.name).toBe("matter.document-generation.v1");
    expect(native.messages).toEqual([{ version: 1, treeId: "tree_1", generation: 4, schema: 1 }]);

    native.receive({ version: 1, treeId: "tree_1", generation: 5, schema: 2 });
    native.receive({ version: 1, treeId: "tree_1", generation: 6, schema: 1, text: "private material" });
    native.receive({ version: 2, treeId: "tree_1", generation: 7, schema: 1 });
    native.receive({ version: 1, treeId: "tree_1", generation: 1.5, schema: 1 });
    native.receive("tree_1:8");
    expect(received).toEqual([{ treeId: "tree_1", writeGeneration: 5, storageSchemaVersion: 2 }]);
  });

  it("isolates observers and closes without retaining them", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const channel = createDocumentGenerationChannel();
    const native = FakeBroadcastChannel.instances[0]!;
    const listener = vi.fn<(generation: DocumentGeneration) => void>();
    channel.subscribe(() => {
      throw new Error("presentation failed");
    });
    channel.subscribe(listener);

    native.receive({ version: 1, treeId: "tree_1", generation: 2, schema: 1 });
    expect(listener).toHaveBeenCalledOnce();
    channel.close();
    native.receive({ version: 1, treeId: "tree_1", generation: 3, schema: 1 });
    expect(listener).toHaveBeenCalledOnce();
    expect(native.closed).toBe(true);
  });

  it("is inert where the platform has no BroadcastChannel", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", undefined);
    const channel = createDocumentGenerationChannel();
    const listener = vi.fn();

    expect(() => channel.publish({ treeId: "tree_1", writeGeneration: 1, storageSchemaVersion: 1 })).not.toThrow();
    channel.subscribe(listener)();
    channel.close();
    expect(listener).not.toHaveBeenCalled();
  });
});
