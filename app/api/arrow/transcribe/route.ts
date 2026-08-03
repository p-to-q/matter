import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  ArrowServerError,
} from "@/features/arrow/server/errors";
import { transcribeAudio } from "@/features/arrow/server/transcriber";
import { MAX_AUDIO_REQUEST_BYTES } from "@/features/arrow/voice/audio-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_AUDIO_REQUEST_BYTES) {
      throw new ArrowServerError(
        "TRANSCRIPTION_FAILED",
        "The recording is too large.",
        false,
        413,
      );
    }
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      throw new ArrowServerError(
        "TRANSCRIPTION_FAILED",
        "The recording request format was invalid.",
        false,
        415,
      );
    }
    let body: FormData;
    try {
      body = await request.formData();
    } catch {
      throw new ArrowServerError(
        "TRANSCRIPTION_FAILED",
        "The recording request could not be read.",
        true,
        400,
      );
    }
    const audioValue = body.get("audio");
    const audio = audioValue instanceof File ? audioValue : null;
    const localeValue = body.get("locale");
    const locale =
      typeof localeValue === "string" && localeValue.length <= 35
        ? localeValue
        : "zh-CN";
    const durationValue = body.get("durationMs");
    if (
      typeof durationValue !== "string" ||
      durationValue.trim() === "" ||
      !Number.isFinite(Number(durationValue))
    ) {
      throw new ArrowServerError(
        "TRANSCRIPTION_FAILED",
        "The recording duration was invalid.",
        true,
        400,
      );
    }
    const durationMs = Number(durationValue);
    const fixtureMode = body.get("fixtureMode") === "true";
    const purposeValue = body.get("purpose");
    if (purposeValue !== "create" && purposeValue !== "transform") {
      throw new ArrowServerError(
        "TRANSCRIPTION_FAILED",
        "The recording purpose was invalid.",
        false,
        400,
      );
    }

    return NextResponse.json(
      await transcribeAudio(audio, locale, durationMs, fixtureMode, purposeValue),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
