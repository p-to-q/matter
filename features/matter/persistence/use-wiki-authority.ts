"use client";

import { useEffect } from "react";

/** Hydrates local lexical authority without adding permanent product chrome. */
export function useWikiAuthority() {
  useEffect(() => {
    void import("./wiki-runtime-core")
      .then(({ startMatterWikiAuthority }) => startMatterWikiAuthority())
      .catch(() => undefined);
  }, []);
}
