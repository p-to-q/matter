import { NextResponse } from "next/server";
import { PROTOCOL_VERSION } from "@/features/arrow/engine/protocol";

export function GET() {
  return NextResponse.json({
    ok: true,
    adapter: process.env.ARROW_AGENT_ADAPTER ?? "mock",
    transcription: process.env.ARROW_TRANSCRIPTION_ADAPTER ?? "mock",
    protocolVersions: [PROTOCOL_VERSION],
  });
}
