import { open, readFile, rm } from "node:fs/promises";

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

export async function acquireE2eRunLock(
  lockPath,
  currentPid = process.pid,
  signalProcess = process.kill,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(`${currentPid}\n`);
      } catch (error) {
        await handle.close();
        await rm(lockPath, { force: true });
        throw error;
      }
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        await handle.close();
        await rm(lockPath, { force: true });
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const owner = Number.parseInt(await readFile(lockPath, "utf8").catch(() => ""), 10);
      if (!Number.isSafeInteger(owner) || owner <= 0) {
        throw new Error("Matter E2E lock exists without valid owner metadata.");
      }
      let ownerIsLive = false;
      try {
        signalProcess(owner, 0);
        ownerIsLive = true;
      } catch (signalError) {
        if (signalError?.code !== "ESRCH") throw signalError;
      }
      if (ownerIsLive) {
        throw new Error(`Matter E2E is already running under process ${owner}.`);
      }
      await rm(lockPath, { force: true });
    }
  }
  throw new Error("Matter E2E could not acquire its run lock.");
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
