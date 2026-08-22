/**
 * The voice vocabulary both transports speak.
 *
 * It lives apart from either of them because it belongs to neither: the
 * MediaRecorder transport and the browser-speech transport each construct a
 * `VoiceError` and each satisfy `VoicePort`, and while these types lived beside
 * one of them the two modules imported each other. A cycle there means neither
 * transport can be read, tested, or replaced without the other — and the
 * product's whole position is that they are separate transports.
 */

export type VoiceOperation = Readonly<{
  interactionId: string;
  attempt: number;
}>;

export type VoiceSample = Readonly<{ level: number }>;

export type VoiceRecording = Readonly<{
  operation: VoiceOperation;
  audio: Blob;
  durationMs: number;
  /** Browser-native recognition can provide a final transcript without audio upload. */
  transcript?: string;
}>;

export type VoiceErrorCode =
  | "VOICE_UNSUPPORTED"
  | "MICROPHONE_DENIED"
  | "MICROPHONE_NOT_FOUND"
  | "MICROPHONE_UNAVAILABLE"
  | "RECORDING_ACTIVE"
  | "RECORDING_NOT_ACTIVE"
  | "RECORDING_EMPTY"
  | "RECORDING_TOO_LARGE"
  | "RECORDING_FAILED"
  | "RECORDING_CANCELLED";

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;

  constructor(code: VoiceErrorCode) {
    super(code);
    this.name = "VoiceError";
    this.code = code;
  }
}

export type VoicePort = Readonly<{
  start(
    operation: VoiceOperation,
    callbacks?: VoiceCallbacks,
  ): Promise<void>;
  stop(operation: VoiceOperation): Promise<VoiceRecording>;
  cancel(operation: VoiceOperation): void;
}>;

export type VoiceCallbacks = Readonly<{
  onSample?: (sample: VoiceSample) => void;
  onTranscript?: (transcript: string) => void;
  locale?: string;
  /** A narrower consumer may reserve its own final-transcript capacity. */
  maxTranscriptCodePoints?: number;
  onDurationLimit?: (operation: VoiceOperation) => void;
  onRecording?: (recording: VoiceRecording) => void;
  onError?: (error: VoiceError) => void;
  /** A different Matter voice lifecycle acquired the shared browser lease. */
  onOwnershipRevoked?: (operation: VoiceOperation) => void;
}>;
