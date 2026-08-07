export const CANONICAL_NEXT_ROUTE_REFERENCE = 'import "./.next/types/routes.d.ts";';
export const CANONICAL_NEXT_ROOT_PARAMS_REFERENCE = 'import "./.next/types/root-params.d.ts";';

export function normalizeNextEnvironment(source) {
  return source
    .replace(
      /^import "\.\/\.next(?:-e2e)?(?:\/dev)?\/types\/routes\.d\.ts";$/m,
      CANONICAL_NEXT_ROUTE_REFERENCE,
    )
    .replace(
      /^import "\.\/\.next(?:-e2e)?(?:\/dev)?\/types\/root-params\.d\.ts";$/m,
      CANONICAL_NEXT_ROOT_PARAMS_REFERENCE,
    );
}

export function createSignalTerminator(child, schedule = setTimeout, cancel = clearTimeout) {
  let signal = null;
  let escalation = null;

  return {
    request(nextSignal) {
      if (signal !== null) return false;
      signal = nextSignal;
      child.kill(nextSignal);
      escalation = schedule(() => child.kill("SIGKILL"), 5_000);
      escalation.unref?.();
      return true;
    },
    clear() {
      if (escalation !== null) cancel(escalation);
      escalation = null;
    },
    signal() {
      return signal;
    },
  };
}

/**
 * POSIX detached children lead a process group, so signalling the negative pid
 * also reaches Playwright and the Next server it owns. Windows lacks that
 * primitive here and deliberately falls back to the direct child handle.
 */
export function createProcessSignalTarget(
  child,
  platform = process.platform,
  signalProcess = process.kill,
) {
  if (platform === "win32" || !Number.isSafeInteger(child.pid) || child.pid <= 0) {
    return child;
  }
  return {
    kill(signal) {
      try {
        return signalProcess(-child.pid, signal);
      } catch (error) {
        if (error?.code === "ESRCH") return false;
        throw error;
      }
    },
  };
}
