"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { planToSceneCommand } from "../engine/scene-engine";
import { requestPlan, transcribe } from "../lib/api-client";
import { useArrowStore } from "../store/arrow-store";
import {
  microphoneStartError,
  RECORDING_LIMIT_MS,
} from "../voice/audio-policy";
import { BrowserVoiceAdapter } from "../voice/browser-voice-adapter";
import { clampAnchor } from "./anchor";
import { createInteractionEnvelope, createTransformEnvelope } from "./envelope";

function createInteractionId() {
  return `interaction_${crypto.randomUUID()}`;
}

export function useVoiceTurn() {
  const searchParams = useSearchParams();
  const fixtureMode = searchParams.get("demo") === "fixture";
  const phase = useArrowStore((state) => state.phase);
  const setPhase = useArrowStore((state) => state.setPhase);
  const setTool = useArrowStore((state) => state.setTool);
  const setAnchor = useArrowStore((state) => state.setAnchor);
  const setAudioLevel = useArrowStore((state) => state.setAudioLevel);
  const setTranscript = useArrowStore((state) => state.setTransientTranscript);
  const setError = useArrowStore((state) => state.setError);
  const clearInteraction = useArrowStore((state) => state.clearInteraction);
  const commit = useArrowStore((state) => state.commit);

  const adapter = useRef(new BrowserVoiceAdapter());
  const fixtureLevelTimer = useRef<number | null>(null);
  const recordingLimitTimer = useRef<number | null>(null);
  const recordingStartedAt = useRef(0);
  const activeInteractionId = useRef<string | null>(null);
  const stopListeningRef = useRef<() => Promise<void>>(async () => undefined);

  const clearTimers = useCallback(() => {
    if (fixtureLevelTimer.current !== null) {
      window.clearInterval(fixtureLevelTimer.current);
      fixtureLevelTimer.current = null;
    }
    if (recordingLimitTimer.current !== null) {
      window.clearTimeout(recordingLimitTimer.current);
      recordingLimitTimer.current = null;
    }
  }, []);

  useEffect(() => {
    const voiceAdapter = adapter.current;
    return () => {
      clearTimers();
      voiceAdapter.cancel();
    };
  }, [clearTimers]);

  const startFixture = useCallback(() => {
    recordingStartedAt.current = performance.now();
    let tick = 0;
    fixtureLevelTimer.current = window.setInterval(() => {
      tick += 1;
      setAudioLevel(0.18 + Math.abs(Math.sin(tick * 0.72)) * 0.48);
    }, 80);
    setPhase("listening");
  }, [setAudioLevel, setPhase]);

  const startListening = useCallback(async () => {
    if (fixtureMode) {
      startFixture();
    } else {
      setPhase("requesting-permission");
      try {
        await adapter.current.start(({ level }) => setAudioLevel(level));
        setPhase("listening");
      } catch (error) {
        setError(microphoneStartError(error));
        return;
      }
    }

    recordingLimitTimer.current = window.setTimeout(
      () => void stopListeningRef.current(),
      RECORDING_LIMIT_MS,
    );
  }, [fixtureMode, setAudioLevel, setError, setPhase, startFixture]);

  const runTurn = useCallback(
    async (audio: Blob, durationMs: number) => {
      const state = useArrowStore.getState();
      const interactionId = activeInteractionId.current;
      if ((!state.anchor && !state.selection) || !interactionId) return;

      try {
        setPhase("transcribing");
        setAudioLevel(0);
        const purpose = state.selection ? "transform" : "create";
        const result = await transcribe(
          audio,
          navigator.language,
          durationMs,
          fixtureMode,
          purpose,
        );
        setTranscript(result.transcript);
        setPhase("planning");

        const currentScene = useArrowStore.getState().scene;
        const envelope = state.selection
          ? createTransformEnvelope({
              interactionId,
              scene: currentScene,
              selection: state.selection,
              gesture: {
                type: "stretch",
                axis: "vertical",
                amount: state.stretchAmount,
                startExtent: state.selection.screenRects.reduce(
                  (width, rect) => width + rect.width,
                  0,
                ),
                endExtent:
                  Math.max(
                    4,
                    state.selection.screenRects.reduce(
                      (width, rect) => width + rect.width,
                      0,
                    ) *
                      (1 + state.stretchAmount),
                  ),
              },
              fixtureMode,
              ...result,
            })
          : state.anchor
            ? createInteractionEnvelope({
                interactionId,
                scene: currentScene,
                anchor: state.anchor,
                fixtureMode,
                ...result,
              })
            : null;
        if (!envelope) throw new Error("The interaction no longer has a target.");
        const plan = await requestPlan(envelope);
        setPhase("applying");
        commit(planToSceneCommand(useArrowStore.getState().scene, plan));
        window.setTimeout(clearInteraction, 520);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "The thought could not be formed. Try again.",
        );
      }
    },
    [
      clearInteraction,
      commit,
      fixtureMode,
      setAudioLevel,
      setError,
      setPhase,
      setTranscript,
    ],
  );

  const stopListening = useCallback(async () => {
    clearTimers();
    try {
      if (fixtureMode) {
        const durationMs = Math.max(
          600,
          performance.now() - recordingStartedAt.current,
        );
        await runTurn(new Blob([], { type: "audio/webm" }), Math.round(durationMs));
        return;
      }

      const recording = await adapter.current.stop();
      await runTurn(recording.audio, recording.durationMs);
    } catch {
      setError("The recording could not be completed. Try again.");
    }
  }, [clearTimers, fixtureMode, runTurn, setError]);

  useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  const toggleVoice = useCallback(() => {
    if (phase === "listening") {
      void stopListening();
      return;
    }
    const selection = useArrowStore.getState().selection;
    if (phase === "selected" || (phase === "error" && selection)) {
      activeInteractionId.current = createInteractionId();
      void startListening();
      return;
    }
    if (phase === "idle" || phase === "error") {
      clearInteraction();
      setTool("voice");
      setPhase("armed");
      return;
    }
    if (phase === "armed") clearInteraction();
  }, [clearInteraction, phase, setPhase, setTool, startListening, stopListening]);

  const placeAnchor = useCallback(
    (point: { x: number; y: number }) => {
      if (phase !== "armed") return;
      activeInteractionId.current = createInteractionId();
      setAnchor(clampAnchor(point));
      void startListening();
    },
    [phase, setAnchor, startListening],
  );

  return { fixtureMode, finishVoice: stopListening, placeAnchor, toggleVoice };
}
