"use client";

import { useEffect, useState } from "react";
import { prepareVoiceReadiness, type VoiceReadiness } from "./voice-readiness";

export type VoiceReadinessState =
  | Readonly<{ status: "checking" }>
  | VoiceReadiness;

const CHECKING: VoiceReadinessState = Object.freeze({ status: "checking" });

/**
 * A control stays inert while the browser voice path is being prepared. This
 * avoids consuming the first pointer activation before its transport exists.
 */
export function useVoiceReadiness(): VoiceReadinessState {
  const [state, setState] = useState<VoiceReadinessState>(CHECKING);

  useEffect(() => {
    let active = true;
    void prepareVoiceReadiness().then((next) => {
      if (active) setState(next);
    });
    return () => { active = false; };
  }, []);

  return state;
}
