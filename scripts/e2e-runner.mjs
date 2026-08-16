import { randomUUID } from "node:crypto";
import { open, readFile, rm, stat } from "node:fs/promises";

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
  createToken = randomUUID,
) {
  if (!Number.isSafeInteger(currentPid) || currentPid <= 0) {
    throw new Error("Matter E2E requires a positive safe process id.");
  }
  const ownerRecord = serializeLockOwner(currentPid, createToken());
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await installOwnedLock(lockPath, ownerRecord);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existingRecord = await readTextOrNull(lockPath);
      if (existingRecord === null) continue;
      const owner = parseLockOwner(existingRecord);
      if (owner === null) {
        throw new Error("Matter E2E lock exists without valid owner metadata.");
      }
      try {
        await signalProcess(owner.pid, 0);
      } catch (signalError) {
        if (signalError?.code === "ESRCH") {
          throw new Error(
            `Matter E2E found a stale lock from process ${owner.pid}; remove it before retrying.`,
          );
        }
        throw signalError;
      }
      throw new Error(`Matter E2E is already running under process ${owner.pid}.`);
    }
  }
  throw new Error("Matter E2E could not acquire its run lock.");
}

function parseLockOwner(record) {
  const match = /^(?<pid>[1-9]\d*):(?<token>[A-Za-z0-9_-]{16,128})\n$/u.exec(record);
  if (match?.groups === undefined) return null;
  const pid = Number(match.groups.pid);
  return Number.isSafeInteger(pid) && pid > 0
    ? { pid, token: match.groups.token }
    : null;
}

function serializeLockOwner(pid, token) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(token)) {
    throw new Error("Matter E2E requires a canonical owner token.");
  }
  return `${pid}:${token}\n`;
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function installOwnedLock(lockPath, ownerRecord) {
  const handle = await open(lockPath, "wx");
  let ownedFile = null;
  try {
    ownedFile = await handle.stat({ bigint: true });
    await handle.writeFile(ownerRecord);
  } catch (error) {
    const cleanupFailures = [];
    try {
      await handle.close();
    } catch (closeError) {
      cleanupFailures.push(closeError);
    }
    try {
      await removeOwnedPath(lockPath, ownedFile);
    } catch (removeError) {
      cleanupFailures.push(removeError);
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [error, ...cleanupFailures],
        "Matter E2E lock installation cleanup failed.",
      );
    }
    throw error;
  }

  return createOwnedRelease(lockPath, handle, ownedFile, ownerRecord);
}

function createOwnedRelease(lockPath, handle, ownedFile, ownerRecord) {
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    const failures = [];
    try {
      await handle.close();
    } catch (error) {
      failures.push(error);
    }
    try {
      await removeOwnedPath(lockPath, ownedFile, ownerRecord);
    } catch (error) {
      failures.push(error);
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, "Matter E2E lock release failed.");
    }
  };
}

async function removeOwnedPath(lockPath, ownedFile, ownerRecord = null) {
  if (ownedFile === null) return;
  const currentFile = await readStatOrNull(lockPath);
  if (currentFile === null || !sameFile(currentFile, ownedFile)) return;
  const currentRecord = ownerRecord === null ? null : await readTextOrNull(lockPath);
  if (
    ownerRecord === null
    || currentRecord === ownerRecord
  ) {
    await rm(lockPath, { force: true });
  }
}

async function readStatOrNull(path) {
  try {
    return await stat(path, { bigint: true });
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function readTextOrNull(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
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
