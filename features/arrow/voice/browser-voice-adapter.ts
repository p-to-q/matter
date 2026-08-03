import {
  isSupportedAudioType,
  RECORDING_MIME_CANDIDATES,
} from "./audio-policy";

export type VoiceSample = {
  level: number;
};

export type VoiceRecording = {
  audio: Blob;
  durationMs: number;
};

export type VoiceAdapter = {
  start(onSample: (sample: VoiceSample) => void): Promise<void>;
  stop(): Promise<VoiceRecording>;
  cancel(): void;
};

export class BrowserVoiceAdapter implements VoiceAdapter {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private frame: number | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private stopPromise: Promise<VoiceRecording> | null = null;
  private stopReject: ((reason: Error) => void) | null = null;

  async start(onSample: (sample: VoiceSample) => void) {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      throw new Error("Microphone recording is not supported in this browser.");
    }

    if (this.recorder?.state === "recording" || this.stopPromise) {
      throw new Error("A recording is already active.");
    }

    const mimeType = RECORDING_MIME_CANDIDATES.find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    if (!mimeType) {
      throw new Error("This browser cannot create a supported audio recording.");
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.chunks = [];
      this.recorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 64_000,
      });
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.start(250);
      this.startedAt = performance.now();
      this.startMeter(onSample);
    } catch (error) {
      this.release();
      throw error;
    }
  }

  async stop(): Promise<VoiceRecording> {
    if (this.stopPromise) return this.stopPromise;

    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive") {
      throw new Error("No recording is active.");
    }

    this.stopPromise = new Promise<VoiceRecording>((resolve, reject) => {
      this.stopReject = reject;
      recorder.onerror = () => {
        reject(new Error("The recording could not finish."));
      };
      recorder.onstop = () => {
        const type = recorder.mimeType;
        const audio = new Blob(this.chunks, { type });
        if (!isSupportedAudioType(type) || audio.size === 0) {
          reject(
            new Error("The browser produced an empty or unsupported recording."),
          );
          return;
        }
        resolve({
          audio,
          durationMs: Math.max(1, Math.round(performance.now() - this.startedAt)),
        });
      };
      recorder.stop();
    });

    return this.stopPromise.finally(() => {
      this.release();
      this.stopPromise = null;
      this.stopReject = null;
    });
  }

  cancel() {
    this.stopReject?.(new Error("The recording was cancelled."));
    this.stopReject = null;
    this.stopPromise = null;
    if (this.recorder?.state === "recording") {
      this.recorder.ondataavailable = null;
      this.recorder.onerror = null;
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.release();
  }

  private startMeter(onSample: (sample: VoiceSample) => void) {
    if (!this.stream || typeof AudioContext === "undefined") return;

    try {
      this.context = new AudioContext();
      const source = this.context.createMediaStreamSource(this.stream);
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);

      const update = () => {
        analyser.getByteFrequencyData(samples);
        const rms = Math.sqrt(
          samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
        );
        onSample({ level: Math.min(1, rms / 72) });
        this.frame = requestAnimationFrame(update);
      };
      update();
    } catch {
      void this.context?.close();
      this.context = null;
    }
  }

  private release() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close();
    this.context = null;
    if (this.recorder) {
      this.recorder.ondataavailable = null;
      this.recorder.onerror = null;
      this.recorder.onstop = null;
    }
    this.recorder = null;
    this.chunks = [];
  }
}
