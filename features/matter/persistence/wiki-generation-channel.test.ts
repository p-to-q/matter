import { afterEach, describe, expect, it, vi } from "vitest";
import { createWikiGenerationChannel } from "./wiki-generation-channel";

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

describe("Wiki generation channel", () => {
  it("moves only validated generations between tabs", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const channel = createWikiGenerationChannel();
    const native = FakeBroadcastChannel.instances[0]!;
    const received: number[] = [];
    channel.subscribe((generation) => received.push(generation));

    channel.publish(7);
    channel.publish(0);
    channel.publish(Number.NaN);
    expect(native.name).toBe("matter.wiki-generation.v1");
    expect(native.messages).toEqual([{ version: 1, generation: 7 }]);

    native.receive({ version: 1, generation: 8 });
    native.receive({ version: 1, generation: 9, text: "private" });
    native.receive({ version: 2, generation: 10 });
    expect(received).toEqual([8]);
  });

  it("isolates observers and closes without retaining them", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const channel = createWikiGenerationChannel();
    const native = FakeBroadcastChannel.instances[0]!;
    const listener = vi.fn<(generation: number) => void>();
    channel.subscribe(() => {
      throw new Error("presentation failed");
    });
    channel.subscribe(listener);

    native.receive({ version: 1, generation: 2 });
    expect(listener).toHaveBeenCalledWith(2);
    channel.close();
    native.receive({ version: 1, generation: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(native.closed).toBe(true);
  });
});
