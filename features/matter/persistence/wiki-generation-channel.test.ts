import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWikiGenerationChannel,
  createWikiGenerationRefreshQueue,
} from "./wiki-generation-channel";

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

  it("coalesces an invalidation burst into one durable refresh", async () => {
    let generation = 0;
    const releases: (() => void)[] = [];
    const refresh = vi.fn(() => new Promise<void>((resolve) => {
      releases.push(() => {
        generation = 24;
        resolve();
      });
    }));
    const queue = createWikiGenerationRefreshQueue(() => generation, refresh);

    const requests = Array.from({ length: 24 }, (_, index) => queue.request(index + 1));

    expect(refresh).toHaveBeenCalledTimes(1);
    releases[0]?.();
    await Promise.all(requests);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes again only when the first load did not reach the newest generation", async () => {
    let generation = 0;
    const releases: (() => void)[] = [];
    const refresh = vi.fn(() => new Promise<void>((resolve) => {
      const loadedGeneration = releases.length === 0 ? 1 : 5;
      releases.push(() => {
        generation = loadedGeneration;
        resolve();
      });
    }));
    const queue = createWikiGenerationRefreshQueue(() => generation, refresh);

    const first = queue.request(1);
    const latest = queue.request(5);
    releases[0]?.();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    releases[1]?.();
    await Promise.all([first, latest]);

    expect(generation).toBe(5);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops on no progress and permits a later retry for the same generation", async () => {
    let generation = 0;
    const refresh = vi.fn(async () => undefined);
    const queue = createWikiGenerationRefreshQueue(() => generation, refresh);

    await queue.request(3);
    expect(refresh).toHaveBeenCalledTimes(1);
    await queue.request(3);
    expect(refresh).toHaveBeenCalledTimes(2);
    generation = 3;
    await queue.request(3);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("retries a failed refresh when a newer invalidation arrived in flight", async () => {
    let generation = 0;
    const releases: Array<() => void> = [];
    const refresh = vi.fn(() => new Promise<void>((resolve, reject) => {
      const attempt = releases.length;
      releases.push(() => {
        if (attempt === 0) reject(new Error("temporary read failure"));
        else {
          generation = 5;
          resolve();
        }
      });
    }));
    const queue = createWikiGenerationRefreshQueue(() => generation, refresh);

    const first = queue.request(1);
    const latest = queue.request(5);
    releases[0]?.();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    releases[1]?.();
    await Promise.all([first, latest]);

    expect(generation).toBe(5);
  });

  it("retries no progress when a newer invalidation arrived in flight", async () => {
    let generation = 0;
    const releases: Array<() => void> = [];
    const refresh = vi.fn(() => new Promise<void>((resolve) => {
      const attempt = releases.length;
      releases.push(() => {
        if (attempt > 0) generation = 5;
        resolve();
      });
    }));
    const queue = createWikiGenerationRefreshQueue(() => generation, refresh);

    const first = queue.request(1);
    const latest = queue.request(5);
    releases[0]?.();
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    releases[1]?.();
    await Promise.all([first, latest]);

    expect(generation).toBe(5);
  });
});
