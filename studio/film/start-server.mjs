import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

export function resolveNpmInvocation(platform = process.platform, comspec = process.env.ComSpec) {
  return platform === "win32"
    ? Object.freeze({
        command: comspec?.trim() || "cmd.exe",
        prefix: Object.freeze(["/d", "/s", "/c", "npm.cmd"]),
      })
    : Object.freeze({ command: "npm", prefix: Object.freeze([]) });
}

async function main() {
  const npmInvocation = resolveNpmInvocation();
  let activeChild = null;
  let requestedSignal = null;

  const forward = (signal) => {
    requestedSignal = signal;
    activeChild?.kill(signal);
  };
  const onInterrupt = () => forward("SIGINT");
  const onTerminate = () => forward("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);

  const run = async (args, label) => {
    await new Promise((resolve, reject) => {
      const child = spawn(npmInvocation.command, [...npmInvocation.prefix, ...args], {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      });
      activeChild = child;
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (activeChild === child) activeChild = null;
        if (requestedSignal !== null) {
          resolve();
          return;
        }
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`${label} exited with ${signal === null ? `code ${code}` : `signal ${signal}`}.`));
      });
    });
  };

  try {
    // A film take is release media. Build first so the recording cannot
    // inherit development-only route indicators, Fast Refresh, or compilation
    // timing, then keep the real production server attached to Playwright.
    await run(["run", "build"], "Matter film production build");
    if (requestedSignal === null) {
      await run([
        "run", "start", "--", "--hostname", "127.0.0.1", "--port", "3120",
      ], "Matter film production server");
    }
  } finally {
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
