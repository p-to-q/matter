import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_TRANSCRIPTION_PREPARE_TIMEOUT_MS,
  LocalTranscriptionError,
  prepareLocalTranscription,
  resampleChannels,
  resetLocalTranscriptionForTests,
  transcribeLocally,
} from "./local-transcription-client";

afterEach(() => {
  resetLocalTranscriptionForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("local transcription audio projection", () => {
  it("waits for the worker code graph without starting model work", async () => {
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

    const preparation = prepareLocalTranscription();

    expect(workers).toHaveLength(1);
    expect(workers[0]?.postMessage).not.toHaveBeenCalled();
    workers[0]?.emit({ status: "ready" });
    await expect(preparation).resolves.toBeUndefined();
    expect(workers[0]?.postMessage).not.toHaveBeenCalled();
  });

  it("retires the lazy worker on pagehide and recreates it only on later intent", async () => {
    const workers: FakeWorker[] = [];
    const pageWindow = Object.assign(new EventTarget(), {
      AudioContext: FakeAudioContext,
      clearTimeout,
      setTimeout,
    });
    const pageDocument = new EventTarget() as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    pageDocument.visibilityState = "visible";
    vi.stubGlobal("window", pageWindow);
    vi.stubGlobal("document", pageDocument);
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    });

    const firstPreparation = prepareLocalTranscription();
    workers[0]?.emit({ status: "ready" });
    await expect(firstPreparation).resolves.toBeUndefined();

    pageDocument.visibilityState = "hidden";
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    pageWindow.dispatchEvent(new Event("pagehide"));
    pageWindow.dispatchEvent(new Event("pageshow"));
    pageDocument.visibilityState = "visible";
    pageDocument.dispatchEvent(new Event("visibilitychange"));
    expect(workers[0]?.terminate).toHaveBeenCalledTimes(1);
    expect(workers).toHaveLength(1);

    const secondPreparation = prepareLocalTranscription();
    expect(workers).toHaveLength(2);
    workers[1]?.emit({ status: "ready" });
    await expect(secondPreparation).resolves.toBeUndefined();
  });

  it("does not publish a worker constructed while the document is already hidden", async () => {
    const workers: FakeWorker[] = [];
    const pageWindow = Object.assign(new EventTarget(), {
      AudioContext: FakeAudioContext,
      clearTimeout,
      setTimeout,
    });
    const pageDocument = new EventTarget() as EventTarget & {
      visibilityState: DocumentVisibilityState;
    };
    pageDocument.visibilityState = "hidden";
    vi.stubGlobal("window", pageWindow);
    vi.stubGlobal("document", pageDocument);
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    });

    await expect(prepareLocalTranscription()).rejects.toEqual(
      new LocalTranscriptionError("failed"),
    );
    pageWindow.dispatchEvent(new Event("pagehide"));
    expect(workers[0]?.terminate).toHaveBeenCalledTimes(1);

    pageDocument.visibilityState = "visible";
    pageWindow.dispatchEvent(new Event("pageshow"));
    expect(workers).toHaveLength(1);
    const nextPreparation = prepareLocalTranscription();
    expect(workers).toHaveLength(2);
    workers[1]?.emit({ status: "ready" });
    await expect(nextPreparation).resolves.toBeUndefined();
  });

  it("bounds a worker code graph that never becomes ready", async () => {
    vi.useFakeTimers();
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
    const preparation = prepareLocalTranscription();
    const assertion = expect(preparation).rejects.toEqual(
      new LocalTranscriptionError("timeout"),
    );

    await vi.advanceTimersByTimeAsync(LOCAL_TRANSCRIPTION_PREPARE_TIMEOUT_MS);

    await assertion;
    expect(workers[0]?.terminate).toHaveBeenCalledTimes(1);
  });

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

  it("settles cancellation while the browser audio decoder is stalled", async () => {
    let decoding = false;
    const close = vi.fn(async () => undefined);
    const workers: FakeWorker[] = [];
    vi.stubGlobal("window", {
      AudioContext: class {
        close = close;
        decodeAudioData(): Promise<never> {
          decoding = true;
          return new Promise<never>(() => undefined);
        }
      },
      clearTimeout,
      setTimeout,
    });
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    });
    const controller = new AbortController();
    const pending = transcribeLocally(request(controller.signal, "decoding"));
    await vi.waitFor(() => expect(decoding).toBe(true));

    controller.abort();

    await expect(pending).rejects.toEqual(new LocalTranscriptionError("failed"));
    expect(close).toHaveBeenCalledTimes(1);
    expect(workers).toHaveLength(0);
  });

  it("times out a stalled browser audio decoder before a worker is created", async () => {
    vi.useFakeTimers();
    const close = vi.fn(async () => undefined);
    const workers: FakeWorker[] = [];
    vi.stubGlobal("window", {
      AudioContext: class {
        close = close;
        decodeAudioData(): Promise<never> {
          return new Promise<never>(() => undefined);
        }
      },
      clearTimeout,
      setTimeout,
    });
    vi.stubGlobal("Worker", class extends FakeWorker {
      constructor() {
        super();
        workers.push(this);
      }
    });

    const pending = transcribeLocally(request(new AbortController().signal, "decode-timeout"));
    const assertion = expect(pending).rejects.toEqual(new LocalTranscriptionError("timeout"));

    await vi.advanceTimersByTimeAsync(180_000);

    await assertion;
    expect(close).toHaveBeenCalledTimes(1);
    expect(workers).toHaveLength(0);
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
    expect(firstWorker.postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: "transcribe",
      id: "one:1:1",
      language: "chinese",
      locale: "zh-CN",
      purpose: "admission",
    });
    firstWorker.emit({ id: "one:1:1", status: "started" });
    firstController.abort();

    await expect(first).rejects.toEqual(new LocalTranscriptionError("failed"));
    expect(firstWorker.terminate).toHaveBeenCalledTimes(1);

    const second = transcribeLocally(request(new AbortController().signal, "two"));
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    const secondWorker = workers[1]!;
    secondWorker.emit({ id: "two:1:2", status: "started" });
    secondWorker.emit({ id: "two:1:2", status: "complete", text: "新的转写。" });

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

    worker.emit({ id: "late:1:1", status: "started" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    const second = transcribeLocally(request(new AbortController().signal, "next"));
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    const fresh = workers[1]!;
    // The retired lease can no longer speak for the request the fresh one owns.
    worker.emit({ id: "next:1:2", status: "complete", text: "过期的转写。" });
    fresh.emit({ id: "next:1:2", status: "started" });
    fresh.emit({ id: "next:1:2", status: "complete", text: "当前的转写。" });
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
    worker.emit({ id: "slow:1:1", status: "started" });
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    timers[0]!();

    await expect(first).rejects.toEqual(new LocalTranscriptionError("timeout"));
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    const second = transcribeLocally(request(new AbortController().signal, "after"));
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    // The abandoned inference finishing late cannot become this transcript, and
    // neither can the retired lease answering for the request it never carried.
    worker.emit({ id: "slow:1:1", status: "complete", text: "迟到的转写。" });
    worker.emit({ id: "after:1:2", status: "complete", text: "被放弃的转写。" });
    workers[1]!.emit({ id: "after:1:2", status: "complete", text: "干净的转写。" });
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
    workers[1]!.emit({ id: "three:1:3", status: "complete", text: "重建之后的转写。" });
    await expect(third).resolves.toBe("重建之后的转写。");
  });

  it("retires a failed model lease so the visible retry is genuine", async () => {
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

    const first = transcribeLocally(request(new AbortController().signal, "failed"));
    await vi.waitFor(() => expect(workers[0]?.postMessage).toHaveBeenCalledTimes(1));
    workers[0]?.emit({ id: "failed:1:1", status: "failed", stage: "model-load" });

    await expect(first).rejects.toEqual(new LocalTranscriptionError("failed"));
    expect(workers[0]?.terminate).toHaveBeenCalledTimes(1);

    const retry = transcribeLocally(request(new AbortController().signal, "retry"));
    await vi.waitFor(() => expect(workers).toHaveLength(2));
    workers[1]?.emit({ id: "retry:1:2", status: "complete", text: "重试成功。" });
    await expect(retry).resolves.toBe("重试成功。");
  });

  it("reports no speech without retiring the warm model lease", async () => {
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

    const silent = transcribeLocally(request(new AbortController().signal, "silent"));
    await vi.waitFor(() => expect(workers[0]?.postMessage).toHaveBeenCalledTimes(1));
    workers[0]?.emit({ id: "silent:1:1", status: "no-speech" });

    await expect(silent).rejects.toEqual(new LocalTranscriptionError("no-speech"));
    expect(workers[0]?.terminate).not.toHaveBeenCalled();

    const retry = transcribeLocally(request(new AbortController().signal, "after-silence"));
    await vi.waitFor(() => expect(workers[0]?.postMessage).toHaveBeenCalledTimes(2));
    workers[0]?.emit({
      id: "after-silence:1:2",
      status: "complete",
      text: "这一次听清楚了。",
    });
    await expect(retry).resolves.toBe("这一次听清楚了。");
    expect(workers).toHaveLength(1);
  });

  it("retires a worker that returns text outside the request capacity", async () => {
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

    const pending = transcribeLocally(request(new AbortController().signal, "oversized"));
    await vi.waitFor(() => expect(workers[0]?.postMessage).toHaveBeenCalledTimes(1));
    workers[0]?.emit({
      id: "oversized:1:1",
      status: "complete",
      text: "念".repeat(2_001),
    });

    await expect(pending).rejects.toEqual(new LocalTranscriptionError("failed"));
    expect(workers[0]?.terminate).toHaveBeenCalledTimes(1);
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
    worker.emit({ id: "active:1:1", status: "started" });
    queuedController.abort();

    await expect(queued).rejects.toEqual(new LocalTranscriptionError("failed"));
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: "cancel", id: "queued:1:2" });

    worker.emit({ id: "queued:1:2", status: "cancelled" });
    worker.emit({ id: "active:1:1", status: "complete", text: "仍在进行的转写。" });
    await expect(first).resolves.toBe("仍在进行的转写。");
  });

  it("isolates a remounted operation from an older queued cancellation", async () => {
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
    const first = transcribeLocally(request(firstController.signal, "reused"));
    await vi.waitFor(() => expect(workers[0]?.postMessage).toHaveBeenCalledTimes(1));
    firstController.abort();
    await expect(first).rejects.toEqual(new LocalTranscriptionError("failed"));

    const second = transcribeLocally(request(new AbortController().signal, "reused"));
    await vi.waitFor(() => expect(workers[0]?.postMessage).toHaveBeenCalledTimes(3));
    expect(workers[0]?.postMessage.mock.calls[2]?.[0]).toMatchObject({
      type: "transcribe",
      id: "reused:1:2",
    });
    workers[0]?.emit({ id: "reused:1:1", status: "cancelled" });
    workers[0]?.emit({ id: "reused:1:2", status: "started" });
    workers[0]?.emit({ id: "reused:1:2", status: "complete", text: "新的请求。" });

    await expect(second).resolves.toBe("新的请求。");
  });
});

function request(signal: AbortSignal, interactionId: string) {
  return {
    interactionId,
    attempt: 1,
    purpose: "admission" as const,
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
