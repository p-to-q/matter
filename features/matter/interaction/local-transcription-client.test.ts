import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocalTranscriptionError,
  resampleChannels,
  resetLocalTranscriptionForTests,
  transcribeLocally,
} from "./local-transcription-client";

afterEach(() => {
  resetLocalTranscriptionForTests();
  vi.unstubAllGlobals();
});

describe("local transcription audio projection", () => {
  it("downmixes channels and resamples without changing duration", () => {
    const result = resampleChannels([
      new Float32Array([0, 1, 0, -1]),
      new Float32Array([0, 0, 0, 0]),
    ], 4, 2);
    expect([...result]).toEqual([0, 0]);
  });

  it("rejects empty or inconsistent channel data", () => {
    expect(() => resampleChannels([], 48_000, 16_000))
      .toThrowError(new LocalTranscriptionError("no-speech"));
    expect(() => resampleChannels([
      new Float32Array([0]),
      new Float32Array([0, 1]),
    ], 48_000, 16_000)).toThrowError(LocalTranscriptionError);
  });

  it("retires active inference on cancellation and lazily rebuilds the worker", async () => {
    const workers: FakeWorker[] = [];
    vi.stubGlobal("window", {
      AudioContext: FakeAudioContext,
      clearTimeout,
      setTimeout,
    });
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    });

    const firstController = new AbortController();
    const first = transcribeLocally(request(firstController.signal, "one"));
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    const firstWorker = workers[0]!;
    await vi.waitFor(() => expect(firstWorker.postMessage).toHaveBeenCalledTimes(1));
    firstWorker.emit({ id: "one:1", status: "started" });
    firstController.abort();

    await expect(first).rejects.toEqual(new LocalTranscriptionError("failed"));
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);

    const second = transcribeLocally(request(new AbortController().signal, "two"));
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    const secondWorker = workers[1]!;
    secondWorker.emit({ id: "two:1", status: "started" });
    secondWorker.emit({ id: "two:1", status: "complete", text: "新的转写。" });

    await expect(second).resolves.toBe("新的转写。");
    expect(secondWorker.terminate).not.toHaveBeenCalled();
  });

  it("retires a lease whose start message arrives after the cancellation", async () => {
    const workers: FakeWorker[] = [];
    vi.stubGlobal("window", {
      AudioContext: FakeAudioContext,
      clearTimeout,
      setTimeout,
    });
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    });

    // Inference had already begun when the person dismissed the recording; the
    // main thread simply had not read the message saying so yet.
    const controller = new AbortController();
    const first = transcribeLocally(request(controller.signal, "late"));
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    const worker = workers[0]!;
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1));
    controller.abort();
    await expect(first).rejects.toEqual(new LocalTranscriptionError("failed"));
    expect(worker.terminate).not.toHaveBeenCalled();

    worker.emit({ id: "late:1", status: "started" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    const second = transcribeLocally(request(new AbortController().signal, "next"));
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    const fresh = workers[1]!;
    // The retired lease can no longer speak for the request the fresh one owns.
    worker.emit({ id: "next:1", status: "complete", text: "过期的转写。" });
    fresh.emit({ id: "next:1", status: "started" });
    fresh.emit({ id: "next:1", status: "complete", text: "当前的转写。" });
    await expect(second).resolves.toBe("当前的转写。");
  });

  it("retires the lease on timeout and lets the next attempt start clean", async () => {
    const workers: FakeWorker[] = [];
    const timers: Array<() => void> = [];
    vi.stubGlobal("window", {
      AudioContext: FakeAudioContext,
      clearTimeout: () => undefined,
      // A controllable clock: the deadline is 3 minutes, which no test may wait.
      setTimeout: (run: () => void) => timers.push(run),
    });
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    });

    const first = transcribeLocally(request(new AbortController().signal, "slow"));
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    const worker = workers[0]!;
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(1));
    worker.emit({ id: "slow:1", status: "started" });
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    timers[0]!();

    await expect(first).rejects.toEqual(new LocalTranscriptionError("timeout"));
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    const second = transcribeLocally(request(new AbortController().signal, "after"));
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    // The abandoned inference finishing late cannot become this transcript, and
    // neither can the retired lease answering for the request it never carried.
    worker.emit({ id: "slow:1", status: "complete", text: "迟到的转写。" });
    worker.emit({ id: "after:1", status: "complete", text: "被放弃的转写。" });
    workers[1]!.emit({ id: "after:1", status: "complete", text: "干净的转写。" });
    await expect(second).resolves.toBe("干净的转写。");
  });

  it("does not let a worker error strand the requests it was carrying", async () => {
    const workers: FakeWorker[] = [];
    vi.stubGlobal("window", {
      AudioContext: FakeAudioContext,
      clearTimeout,
      setTimeout,
    });
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    });

    const first = transcribeLocally(request(new AbortController().signal, "one"));
    const second = transcribeLocally(request(new AbortController().signal, "two"));
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    const worker = workers[0]!;
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(2));
    worker.fail();

    await expect(first).rejects.toEqual(new LocalTranscriptionError("failed"));
    await expect(second).rejects.toEqual(new LocalTranscriptionError("failed"));
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    const third = transcribeLocally(request(new AbortController().signal, "three"));
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    workers[1]!.emit({ id: "three:1", status: "complete", text: "重建之后的转写。" });
    await expect(third).resolves.toBe("重建之后的转写。");
  });

  it("skips a queued cancellation without interrupting the active inference", async () => {
    const workers: FakeWorker[] = [];
    vi.stubGlobal("window", {
      AudioContext: FakeAudioContext,
      clearTimeout,
      setTimeout,
    });
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    });

    const first = transcribeLocally(request(new AbortController().signal, "active"));
    const queuedController = new AbortController();
    const queued = transcribeLocally(request(queuedController.signal, "queued"));
    await vi.waitFor(() => expect(workers).toHaveLength(1));
    const worker = workers[0]!;
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(2));
    worker.emit({ id: "active:1", status: "started" });
    queuedController.abort();

    await expect(queued).rejects.toEqual(new LocalTranscriptionError("failed"));
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: "cancel", id: "queued:1" });

    worker.emit({ id: "queued:1", status: "cancelled" });
    worker.emit({ id: "active:1", status: "complete", text: "仍在进行的转写。" });
    await expect(first).resolves.toBe("仍在进行的转写。");
  });
});

function request(signal: AbortSignal, interactionId: string) {
  return {
    interactionId,
    attempt: 1,
    locale: "zh-CN",
    audio: new Blob(["audio"], { type: "audio/webm" }),
    signal,
  };
}

class FakeAudioContext {
  async close(): Promise<void> {}

  async decodeAudioData() {
    return {
      numberOfChannels: 1,
      sampleRate: 16_000,
      getChannelData: () => new Float32Array([0.25, -0.25]),
    };
  }
}

class FakeWorker {
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();
  private readonly listeners = new Map<string, ((event: MessageEvent<unknown>) => void)[]>();

  addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(data: unknown): void {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data } as MessageEvent<unknown>);
    }
  }

  fail(): void {
    for (const listener of this.listeners.get("error") ?? []) {
      listener({} as MessageEvent<unknown>);
    }
  }
}
