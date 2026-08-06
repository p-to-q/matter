export const CANONICAL_NEXT_ROUTE_REFERENCE = 'import "./.next/types/routes.d.ts";';

export function normalizeNextEnvironment(source) {
  return source.replace(
    /^import "\.\/\.next(?:-e2e)?(?:\/dev)?\/types\/routes\.d\.ts";$/m,
    CANONICAL_NEXT_ROUTE_REFERENCE,
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
