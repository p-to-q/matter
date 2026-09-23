import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
let activeChild = null;
let requestedSignal = null;

function forward(signal) {
  requestedSignal = signal;
  activeChild?.kill(signal);
}

const onInterrupt = () => forward("SIGINT");
const onTerminate = () => forward("SIGTERM");
process.on("SIGINT", onInterrupt);
process.on("SIGTERM", onTerminate);

async function run(args, label) {
  await new Promise((resolve, reject) => {
    const child = spawn(npm, args, {
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
}

try {
  // A launch take is release media. Build first so the recording cannot
  // inherit development-only route indicators, Fast Refresh, or compilation
  // timing, then keep the real production server attached to Playwright.
  await run(["run", "build"], "Matter launch production build");
  if (requestedSignal === null) {
    await run([
      "run", "start", "--", "--hostname", "127.0.0.1", "--port", "3120",
    ], "Matter launch production server");
  }
} finally {
  process.off("SIGINT", onInterrupt);
  process.off("SIGTERM", onTerminate);
}
