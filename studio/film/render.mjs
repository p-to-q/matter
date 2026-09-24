import { spawn } from "node:child_process";
import { access, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { FILM_COPY } from "./copy.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const durationSeconds = 68;
const outputWidth = 1_440;
const outputHeight = 810;
const captureWidth = 1_600;
const captureHeight = 900;
const framesPerSecond = 30;
const elasticPulseFrames = 14;
const elasticPulseDepth = 0.025;
const documentTitle = FILM_COPY.document.title;
const creditVisibleSeconds = 2.75;
const outroStartSeconds = 63.5;
const outroDurationSeconds = durationSeconds - outroStartSeconds;
const outroFrameCount = outroDurationSeconds * framesPerSecond;

const cameraContracts = Object.freeze({
  about: Object.freeze({
    startCue: "about-start",
    endCue: "about-end",
    maxZoom: 1.42,
    safePadding: 80,
    motion: Object.freeze({ riseFrames: 18, settleFrames: 8, overshoot: 0.02, exitFrames: 22 }),
  }),
  voiceTool: Object.freeze({
    startCue: "voice-tool-start",
    endCue: "voice-tool-end",
    interiorCues: Object.freeze([
      Object.freeze({ name: "voice-tool-active", frameKey: "activeFrame" }),
    ]),
    maxZoom: 3.2,
    safePadding: 28,
    // The pressed state is intentionally brief. Keep the camera on the real
    // tool for another 0.8 seconds so the close-up settles without extending
    // the product's active state.
    endHoldFrames: 24,
    motion: Object.freeze({ riseFrames: 14, settleFrames: 5, overshoot: 0.045, exitFrames: 17 }),
  }),
  pointTalk: Object.freeze({
    startCue: "point-talk-start",
    endCue: "point-talk-end",
    maxZoom: 1.68,
    safePadding: 64,
    motion: Object.freeze({ riseFrames: 16, settleFrames: 10, overshoot: 0.06, exitFrames: 24 }),
    // The addressed child has a complete ancestor column immediately to its
    // left. A small optical bias keeps that unrelated oversized fragment out
    // of the close-up while preserving the target's full safety margin.
    centerBiasX: 120,
  }),
  elastic: Object.freeze({
    startCue: "elastic-start",
    endCue: "elastic-end",
    interiorCues: Object.freeze([
      Object.freeze({
        name: "elastic-confirm",
        frameKey: "confirmFrame",
        trailingFrames: elasticPulseFrames,
      }),
    ]),
    maxZoom: 1.62,
    safePadding: 96,
    motion: Object.freeze({ riseFrames: 20, settleFrames: 8, overshoot: 0.035, exitFrames: 28 }),
  }),
  inquiry: Object.freeze({
    startCue: "inquiry-start",
    endCue: "inquiry-end",
    maxZoom: 1.55,
    safePadding: 88,
    motion: Object.freeze({ riseFrames: 24, settleFrames: 0, overshoot: 0, exitFrames: 30 }),
  }),
});

export function parseLaunchVideoArgs(argv, now = new Date()) {
  let execute = false;
  let renderExisting = false;
  let liveInquiry = false;
  let offlineDemo = false;
  let audioPath = null;
  let outputDirectory = null;
  const followingValue = (index, option) => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${option} requires a value.`);
    }
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--execute") {
      execute = true;
    } else if (argument === "--render-existing") {
      renderExisting = true;
    } else if (argument === "--live-inquiry") {
      liveInquiry = true;
    } else if (argument === "--offline-demo") {
      offlineDemo = true;
    } else if (argument === "--audio") {
      audioPath = followingValue(index, "--audio");
      index += 1;
    } else if (argument.startsWith("--audio=")) {
      audioPath = argument.slice("--audio=".length);
    } else if (argument === "--output-dir") {
      outputDirectory = followingValue(index, "--output-dir");
      index += 1;
    } else if (argument.startsWith("--output-dir=")) {
      outputDirectory = argument.slice("--output-dir=".length);
    } else {
      throw new Error(`Unknown launch-video option: ${argument}`);
    }
  }
  if (audioPath !== null && audioPath.trim().length === 0) {
    throw new Error("--audio requires a file path.");
  }
  if (outputDirectory !== null && outputDirectory.trim().length === 0) {
    throw new Error("--output-dir requires a directory path.");
  }
  if (execute && !liveInquiry && !offlineDemo) {
    throw new Error(
      "A complete launch capture requires an explicit Inquiry mode: " +
      "--execute --offline-demo or --execute --live-inquiry.",
    );
  }
  if (liveInquiry && offlineDemo) {
    throw new Error("--live-inquiry and --offline-demo are mutually exclusive.");
  }
  if (execute && renderExisting) {
    throw new Error("--execute and --render-existing are mutually exclusive.");
  }
  if (renderExisting && (liveInquiry || offlineDemo)) {
    throw new Error("--render-existing never accepts an Inquiry mode because it performs no capture.");
  }
  if (renderExisting && outputDirectory === null) {
    throw new Error("--render-existing requires the existing --output-dir.");
  }
  const stamp = now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return Object.freeze({
    execute,
    renderExisting,
    liveInquiry,
    offlineDemo,
    audioPath: audioPath === null ? null : resolve(audioPath),
    outputDirectory: outputDirectory === null
      ? resolve(repositoryRoot, "studio", "film", "artifacts", stamp)
      : resolve(outputDirectory),
  });
}

export function launchVideoCaptureEnvironment(options, baseEnvironment = {}) {
  return Object.freeze({
    ...baseEnvironment,
    MATTER_LAUNCH_LIVE_INQUIRY: options.liveInquiry ? "true" : "false",
    MATTER_LAUNCH_OFFLINE_DEMO: options.offlineDemo ? "true" : "false",
  });
}

export function describeLaunchInquiryMode(options) {
  if (options.renderExisting) return "recorded-receipt";
  if (options.offlineDemo) return "fixture";
  if (options.liveInquiry) return "live";
  return "unselected";
}

function requireFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function floorDecimal(value, places) {
  const factor = 10 ** places;
  return Math.floor(value * factor) / factor;
}

function parseLaunchCueMap(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Launch capture cues are invalid.");
  }
  if (value.version !== 15) throw new Error("Launch capture cues use an unsupported version.");
  if (value.durationMs !== durationSeconds * 1_000) {
    throw new Error("Launch capture cues do not describe the frozen 68-second master.");
  }
  if (value.width !== captureWidth || value.height !== captureHeight) {
    throw new Error("Launch capture cues do not match the 1600x900 capture surface.");
  }
  if (!Array.isArray(value.cues)) throw new Error("Launch capture cue list is missing.");
  validateLaunchCaptureReceipts(value);

  const cueMap = new Map();
  for (const cue of value.cues) {
    if (cue === null || typeof cue !== "object" || Array.isArray(cue)) {
      throw new Error("Launch capture contains an invalid camera cue.");
    }
    if (typeof cue.name !== "string" || cue.name.length === 0) {
      throw new Error("Launch capture contains an unnamed camera cue.");
    }
    const milliseconds = requireFiniteNumber(cue.milliseconds, `${cue.name} time`);
    if (cue.bounds === null || typeof cue.bounds !== "object" || Array.isArray(cue.bounds)) {
      throw new Error(`${cue.name} does not include DOM bounds.`);
    }
    const left = requireFiniteNumber(cue.bounds.left, `${cue.name} left`);
    const top = requireFiniteNumber(cue.bounds.top, `${cue.name} top`);
    const width = requireFiniteNumber(cue.bounds.width, `${cue.name} width`);
    const height = requireFiniteNumber(cue.bounds.height, `${cue.name} height`);
    if (milliseconds < 0 || milliseconds > durationSeconds * 1_000) {
      throw new Error(`${cue.name} falls outside the launch master.`);
    }
    if (
      left < 0 || top < 0 || width <= 0 || height <= 0 ||
      left + width > captureWidth || top + height > captureHeight
    ) {
      throw new Error(`${cue.name} bounds fall outside the capture surface.`);
    }
    if (cueMap.has(cue.name)) throw new Error(`Launch capture repeats the ${cue.name} cue.`);
    cueMap.set(cue.name, Object.freeze({
      milliseconds,
      bounds: Object.freeze({ left, top, width, height }),
    }));
  }

  return cueMap;
}

export function parseLaunchOpeningRootCue(value) {
  const openingRoot = parseLaunchCueMap(value).get("opening-root");
  if (openingRoot === undefined) {
    throw new Error("Launch capture is missing the opening-root composition cue.");
  }
  if (openingRoot.milliseconds > 250) {
    throw new Error("The opening-root composition cue was recorded after the opening settled.");
  }
  const centerError = Math.max(
    Math.abs(openingRoot.bounds.left + openingRoot.bounds.width / 2 - captureWidth / 2),
    Math.abs(openingRoot.bounds.top + openingRoot.bounds.height / 2 - captureHeight / 2),
  );
  if (centerError >= 8) {
    throw new Error("The opening material is not centered in the complete capture frame.");
  }
  return openingRoot;
}

export function parseLaunchCaptureCues(value) {
  const cueMap = parseLaunchCueMap(value);
  const cameraWindows = {};
  for (const [name, contract] of Object.entries(cameraContracts)) {
    const start = cueMap.get(contract.startCue);
    const end = cueMap.get(contract.endCue);
    if (start === undefined || end === undefined) {
      throw new Error(`Launch capture is missing the ${contract.startCue} or ${contract.endCue} cue.`);
    }
    const interiorCues = (contract.interiorCues ?? []).map((interiorContract) => {
      const cue = cueMap.get(interiorContract.name);
      if (cue === undefined) {
        throw new Error(`Launch capture is missing the ${interiorContract.name} cue.`);
      }
      return Object.freeze({ contract: interiorContract, cue });
    });
    const startFrame = Math.round(start.milliseconds * framesPerSecond / 1_000);
    const endFrame = Math.round(end.milliseconds * framesPerSecond / 1_000) +
      (contract.endHoldFrames ?? 0);
    const { riseFrames, settleFrames, overshoot, exitFrames } = contract.motion;
    const entryFrames = riseFrames + settleFrames;
    if (endFrame - startFrame <= entryFrames + exitFrames) {
      throw new Error(`${name} camera window is too short for its frozen spring and exit.`);
    }
    const framedCues = [start, ...interiorCues.map(({ cue }) => cue), end];
    const left = Math.min(...framedCues.map((cue) => cue.bounds.left));
    const top = Math.min(...framedCues.map((cue) => cue.bounds.top));
    const right = Math.max(
      ...framedCues.map((cue) => cue.bounds.left + cue.bounds.width),
    );
    const bottom = Math.max(
      ...framedCues.map((cue) => cue.bounds.top + cue.bounds.height),
    );
    const targetBounds = Object.freeze({ left, top, width: right - left, height: bottom - top });
    const fitZoom = Math.min(
      captureWidth / (targetBounds.width + contract.safePadding * 2),
      captureHeight / (targetBounds.height + contract.safePadding * 2),
    );
    const maxZoom = floorDecimal(clamp(
      Math.min(contract.maxZoom, fitZoom / (1 + overshoot)),
      1,
      contract.maxZoom,
    ), 4);
    const peakZoom = maxZoom === 1
      ? 1
      : floorDecimal(maxZoom * (1 + overshoot), 4);
    // Clamp against the narrowest (overshoot) crop so an edge target cannot be
    // pushed out of frame during the spring peak. At the settled zoom the
    // zoompan expression naturally clamps the wider crop back to the source.
    const halfVisibleWidth = captureWidth / (2 * peakZoom);
    const halfVisibleHeight = captureHeight / (2 * peakZoom);
    const interiorFrames = {};
    for (const { contract: interiorContract, cue } of interiorCues) {
      const frame = Math.round(cue.milliseconds * framesPerSecond / 1_000);
      const trailingFrames = interiorContract.trailingFrames ?? 0;
      if (
        frame < startFrame + entryFrames ||
        frame >= endFrame - exitFrames ||
        frame + trailingFrames > endFrame - exitFrames
      ) {
        throw new Error(`${interiorContract.name} does not fit inside the stable ${name} hold.`);
      }
      interiorFrames[interiorContract.frameKey] = frame;
    }
    const safeCenterMinimumX = Math.max(
      halfVisibleWidth,
      right + contract.safePadding - halfVisibleWidth,
    );
    const safeCenterMaximumX = Math.min(
      captureWidth - halfVisibleWidth,
      left - contract.safePadding + halfVisibleWidth,
    );
    cameraWindows[name] = Object.freeze({
      startFrame,
      endFrame,
      riseFrames,
      settleFrames,
      entryFrames,
      exitFrames,
      overshoot,
      maxZoom,
      peakZoom,
      centerX: clamp(
        left + targetBounds.width / 2 + (contract.centerBiasX ?? 0),
        safeCenterMinimumX,
        safeCenterMaximumX,
      ),
      centerY: clamp(top + targetBounds.height / 2, halfVisibleHeight, captureHeight - halfVisibleHeight),
      targetBounds,
      ...interiorFrames,
    });
  }
  const orderedWindows = Object.entries(cameraWindows)
    .sort((left, right) => left[1].startFrame - right[1].startFrame);
  for (let index = 1; index < orderedWindows.length; index += 1) {
    if (orderedWindows[index - 1][1].endFrame > orderedWindows[index][1].startFrame) {
      throw new Error("Launch camera windows overlap.");
    }
  }
  return Object.freeze(cameraWindows);
}

function validateLaunchCaptureReceipts(value) {
  if (value.complete !== true) {
    throw new Error("Launch capture receipt is incomplete and cannot be rendered.");
  }
  if (value.inquiryMode !== "fixture" && value.inquiryMode !== "live") {
    throw new Error("Launch capture must identify its Inquiry mode.");
  }
  const requests = value.requests;
  if (
    requests === null || typeof requests !== "object" || Array.isArray(requests) ||
    requests.transcribe !== 3 || requests.transform !== 1 ||
    requests.textSwap !== 1 || requests.inquiry !== 1
  ) {
    throw new Error(
      "Launch capture must prove three Transcription requests and exactly one Transform, Text Swap, and Inquiry request.",
    );
  }
  if (
    value.document === null || typeof value.document !== "object" || Array.isArray(value.document) ||
    value.document.title !== documentTitle || Object.keys(value.document).length !== 1
  ) {
    throw new Error("Launch capture does not prove the authored canvas title.");
  }
  const presentation = value.presentation;
  const exactState = (state, theme, leafFx, ambient) =>
    state !== null && typeof state === "object" && !Array.isArray(state) &&
    state.theme === theme && state.leafFx === leafFx && state.ambient === ambient &&
    Object.keys(state).length === 3;
  if (
    presentation === null || typeof presentation !== "object" || Array.isArray(presentation) ||
    !exactState(presentation.opening, "light", "off", "poster") ||
    !exactState(presentation.daylight, "light", "on", "video") ||
    !exactState(presentation.night, "dark", "on", "video")
  ) {
    throw new Error("Launch capture does not prove the frozen paper-light sequence.");
  }
  const events = value.events;
  const eventOrder = [
    "daylight-leaf",
    "night",
    "about",
    "model-api",
    "voice-recording",
    "voice-transcribing",
    "voice-material",
    "point-talk-submitted",
    "point-talk-commit",
    "nested-branch",
    "canvas-zoom-60",
    "canvas-positioned",
    "elastic-commit",
    "elastic-deselected",
    "branch-held-aside",
    "inquiry-answer",
    "branch-restored",
    "undo-elastic",
    "undo-nested-branch",
    "undo-third-branch",
    "undo-point-talk",
    "undo-first-branch",
    "undo-voice-branch",
    "closing-zoom-100",
    "closing-restored",
  ];
  if (events === null || typeof events !== "object" || Array.isArray(events)) {
    throw new Error("Launch capture story receipts are missing.");
  }
  let previous = -1;
  for (const name of eventOrder) {
    const milliseconds = events[name];
    if (!Number.isFinite(milliseconds) || milliseconds <= previous || milliseconds > durationSeconds * 1_000) {
      throw new Error("Launch capture story receipts are missing or out of order.");
    }
    previous = milliseconds;
  }
  if (events.night > 8_000 || events["closing-restored"] >= outroStartSeconds * 1_000) {
    throw new Error("Launch capture does not preserve the frozen early night and quiet ending.");
  }
}

function smoothStep(progress) {
  // Quintic smootherstep keeps velocity and acceleration at zero at both
  // boundaries. The camera can still overshoot, but never arrives with a jolt.
  return `(${progress})*(${progress})*(${progress})*` +
    `((${progress})*((${progress})*6-15)+10)`;
}

function cameraMotionContribution(window) {
  const riseEnd = window.startFrame + window.riseFrames;
  const settleEnd = window.startFrame + window.entryFrames;
  const exitStart = window.endFrame - window.exitFrames;
  const rise = `(on-${window.startFrame})/${window.riseFrames}`;
  const exit = `(${window.endFrame}-on)/${window.exitFrames}`;
  if (window.settleFrames === 0) {
    return `if(lt(on,${window.startFrame}),0,` +
      `if(lt(on,${riseEnd}),${smoothStep(rise)},` +
      `if(lt(on,${exitStart}),1,` +
      `if(lt(on,${window.endFrame}),${smoothStep(exit)},0))))`;
  }
  const settle = `(on-${riseEnd})/${window.settleFrames}`;
  const depth = window.maxZoom - 1;
  const peakContribution = depth === 0 ? 0 : (window.peakZoom - 1) / depth;
  const riseValue = `${peakContribution}*(${smoothStep(rise)})`;
  const settleValue = `${peakContribution}+(1-${peakContribution})*(${smoothStep(settle)})`;
  return `if(lt(on,${window.startFrame}),0,` +
    `if(lt(on,${riseEnd}),${riseValue},` +
    `if(lt(on,${settleEnd}),${settleValue},` +
    `if(lt(on,${exitStart}),1,` +
    `if(lt(on,${window.endFrame}),${smoothStep(exit)},0)))))`;
}

function cameraAxisExpression(windows, axis) {
  const inputDimension = axis === "x" ? "iw" : "ih";
  const centerKey = axis === "x" ? "centerX" : "centerY";
  const coordinate = (window) =>
    `max(0,min(${inputDimension}-${inputDimension}/zoom,` +
    `${window[centerKey]}-${inputDimension}/(2*zoom)))`;
  return Object.values(windows).reduceRight(
    (fallback, window) =>
      `if(between(on,${window.startFrame},${window.endFrame - 1}),${coordinate(window)},${fallback})`,
    "0",
  );
}

export function launchVideoCameraFilter(windows) {
  const zoomContributions = Object.values(windows).map((window) => {
    const depth = Number((window.maxZoom - 1).toFixed(4));
    return `${depth}*(${cameraMotionContribution(window)})`;
  });
  const confirmFrame = windows.elastic.confirmFrame;
  const elasticPulse = confirmFrame === null
    ? ""
    : `+${elasticPulseDepth}*if(between(on,${confirmFrame},${confirmFrame + elasticPulseFrames}),` +
      `sin(PI*(on-${confirmFrame})/${elasticPulseFrames}),0)`;
  const zoom = `1+${zoomContributions.join("+")}${elasticPulse}`;
  const x = cameraAxisExpression(windows, "x");
  const y = cameraAxisExpression(windows, "y");
  return `zoompan=z='${zoom}':x='${x}':y='${y}':d=1:` +
    `s=${outputWidth}x${outputHeight}:fps=${framesPerSecond}`;
}

export function launchOpeningFocusMask(openingRoot) {
  const scaleX = outputWidth / captureWidth;
  const scaleY = outputHeight / captureHeight;
  const horizontalPadding = 48;
  const verticalPadding = 34;
  const left = Math.max(0, Math.floor(openingRoot.bounds.left * scaleX - horizontalPadding));
  const top = Math.max(0, Math.floor(openingRoot.bounds.top * scaleY - verticalPadding));
  const right = Math.min(
    outputWidth,
    Math.ceil((openingRoot.bounds.left + openingRoot.bounds.width) * scaleX + horizontalPadding),
  );
  const bottom = Math.min(
    outputHeight,
    Math.ceil((openingRoot.bounds.top + openingRoot.bounds.height) * scaleY + verticalPadding),
  );
  return `color=c=black:s=${outputWidth}x${outputHeight}:r=${framesPerSecond}:d=3.7,` +
    `format=gray,drawbox=x=${left}:y=${top}:w=${right - left}:h=${bottom - top}:` +
    "color=white:t=fill,boxblur=28:2";
}

export function launchVideoCreditMarkup() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{width:${outputWidth}px;height:${outputHeight}px;margin:0;background:transparent;overflow:hidden}
    body{-webkit-font-smoothing:antialiased}
    aside{position:absolute;right:56px;bottom:72px;width:620px;color:rgba(22,29,39,.66);
      font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;
      font-size:21px;font-weight:300;line-height:1.38;letter-spacing:0;text-align:right;
      font-kerning:normal;text-rendering:optimizeLegibility}
    span,em{display:block}
    em{margin-top:1px;font-style:italic;font-weight:350}
  </style></head><body><aside><span>Archival audio excerpted from Douglas Engelbart’s</span><span>1968 demonstration, since known as</span><em>The Mother of All Demos.</em></aside></body></html>`;
}

export async function renderLaunchVideoCredit(path) {
  const creditBrowser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await creditBrowser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: outputWidth, height: outputHeight },
    });
    await page.setContent(launchVideoCreditMarkup(), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.screenshot({
      animations: "disabled",
      omitBackground: true,
      path,
      type: "png",
    });
  } finally {
    await creditBrowser.close();
  }
}

export function launchVideoOutroMarkup(sourceDataUrl) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{width:${outputWidth}px;height:${outputHeight}px;margin:0;background:#030506;overflow:hidden}
    canvas{display:block;width:${outputWidth}px;height:${outputHeight}px}
  </style></head><body><canvas width="${outputWidth}" height="${outputHeight}"></canvas><script>
    (()=>{
      const canvas=document.querySelector('canvas');
      const ctx=canvas.getContext('2d',{alpha:false});
      const source=new Image();
      const clamp=(value,minimum=0,maximum=1)=>Math.min(maximum,Math.max(minimum,value));
      const ease=(value)=>{const t=clamp(value);return t*t*t*(t*(t*6-15)+10)};
      const lerp=(from,to,amount)=>from+(to-from)*amount;
      const roundedRect=(x,y,width,height,radius)=>{
        const r=Math.min(radius,width/2,height/2);
        ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+width,y,x+width,y+height,r);
        ctx.arcTo(x+width,y+height,x,y+height,r);ctx.arcTo(x,y+height,x,y,r);
        ctx.arcTo(x,y,x+width,y,r);ctx.closePath();
      };
      window.renderMatterOutro=(frame,total)=>{
        const progress=total<=1?1:frame/(total-1);
        const rounding=ease((progress-.03)/.30);
        // The final seeded passage first returns to the opening's haze, now on
        // night paper. The screen begins departing only after that atmosphere
        // is perceptible, so the close rhymes with the opening without replaying it.
        // Blur must keep evolving while the screen departs. A late-biased
        // power curve avoids reaching a static haze halfway through the move;
        // it settles only in the last frames before the picture disappears.
        const pictureBlur=Math.pow(clamp((progress-.10)/.82),1.3);
        const dimming=Math.pow(clamp((progress-.16)/.76),1.2);
        const departure=ease((progress-.12)/.64);
        const exit=ease((progress-.82)/.18);
        const scale=lerp(1,.78,departure);
        const width=canvas.width*scale;const height=canvas.height*scale;
        const arc=Math.sin(Math.PI*departure);
        const x=(canvas.width-width)/2+12*arc;
        const y=(canvas.height-height)/2-18*departure+7*arc;
        const radius=12*rounding;
        ctx.globalAlpha=1;ctx.fillStyle='#030506';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.save();roundedRect(x,y,width,height,radius);ctx.clip();
        ctx.globalAlpha=1-exit;
        ctx.filter='blur('+lerp(0,4,pictureBlur)+'px) brightness('+lerp(1,.72,dimming)+')';
        ctx.drawImage(source,x,y,width,height);ctx.restore();
        if(rounding>0&&exit<1){
          ctx.globalAlpha=(1-exit)*rounding*.18*(1-dimming*.5);ctx.strokeStyle='#dce7e6';ctx.lineWidth=1;
          roundedRect(x+.5,y+.5,width-1,height-1,radius);ctx.stroke();
        }
        ctx.globalAlpha=1;
      };
      source.onload=()=>{window.renderMatterOutro(0,${outroFrameCount});window.outroReady=true};
      source.src=${JSON.stringify(sourceDataUrl)};
    })();
  </script></body></html>`;
}

export async function renderLaunchVideoOutro(sourcePath, framesDirectory) {
  const sourceDataUrl = `data:image/png;base64,${(await readFile(sourcePath)).toString("base64")}`;
  await mkdir(framesDirectory, { recursive: false });
  const outroBrowser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await outroBrowser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: outputWidth, height: outputHeight },
    });
    await page.setContent(launchVideoOutroMarkup(sourceDataUrl), { waitUntil: "load" });
    await page.waitForFunction(() => window.outroReady === true);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    for (let frame = 0; frame < outroFrameCount; frame += 1) {
      await page.evaluate(({ currentFrame, totalFrames }) => {
        window.renderMatterOutro(currentFrame, totalFrames);
      }, { currentFrame: frame, totalFrames: outroFrameCount });
      await page.screenshot({
        animations: "disabled",
        path: resolve(framesDirectory, `frame-${String(frame).padStart(4, "0")}.png`),
        type: "png",
      });
    }
  } finally {
    await outroBrowser.close();
  }
}

export function launchVideoFfmpegArgs(
  rawVideoPath,
  audioPath,
  creditPath,
  outroPattern,
  outputPath,
  cameraWindows,
  openingRoot,
) {
  const camera = launchVideoCameraFilter(cameraWindows);
  const openingFocusMask = launchOpeningFocusMask(openingRoot);
  return Object.freeze([
    "-hide_banner",
    "-loglevel", "warning",
    "-n",
    "-i", rawVideoPath,
    "-i", audioPath,
    "-loop", "1",
    "-framerate", String(framesPerSecond),
    "-i", creditPath,
    "-framerate", String(framesPerSecond),
    "-start_number", "0",
    "-i", outroPattern,
    "-filter_complex",
    `[0:v]setpts=PTS-STARTPTS,fps=${framesPerSecond},` +
      `tpad=stop_mode=clone:stop_duration=${durationSeconds},` +
      `trim=duration=${durationSeconds},${camera},setsar=1,format=yuv420p[camera];` +
      `[camera]split=3[sharp][soft-source][focus-source];` +
      `[soft-source]trim=duration=3.7,setpts=PTS-STARTPTS,gblur=sigma=18[deep-soft-base];` +
      `color=c=white@0.70:s=${outputWidth}x${outputHeight}:r=${framesPerSecond}:d=3.7,` +
      `format=rgba[opening-veil];` +
      `[deep-soft-base][opening-veil]overlay=0:0:format=auto,format=rgba[deep-soft];` +
      // Preserve the surrounding haze; only feather away the dark chrome that
      // would otherwise compete with the archival credit during the opening.
      `color=c=white:s=${outputWidth}x${outputHeight}:r=${framesPerSecond}:d=3.7,` +
      `format=rgba[opening-chrome-white];` +
      `color=c=black:s=${outputWidth}x${outputHeight}:r=${framesPerSecond}:d=3.7,` +
      `format=gray,drawbox=x=1020:y=710:w=420:h=100:color=white:t=fill,` +
      `boxblur=24:2[opening-chrome-mask];` +
      `[deep-soft][opening-chrome-white][opening-chrome-mask]maskedmerge[deep-soft-clean];` +
      `[focus-source]trim=duration=3.7,setpts=PTS-STARTPTS[opening-root-sharp];` +
      `${openingFocusMask}[focus-mask];` +
      `[deep-soft-clean][opening-root-sharp][focus-mask]maskedmerge,format=rgba,lut=a=255,` +
      `fade=t=out:st=2.35:d=1.3:alpha=1[soft];` +
      `[sharp][soft]overlay=0:0:eof_action=pass:shortest=0:format=auto[base];` +
      `[2:v]format=rgba,fade=t=in:st=0.15:d=0.45:alpha=1,` +
      `fade=t=out:st=1.95:d=0.7:alpha=1[credit];` +
      `[base][credit]overlay=0:0:eof_action=pass:shortest=0:format=auto:` +
      `enable='lt(t,${creditVisibleSeconds})'[with-credit];` +
      `[3:v]setpts=PTS-STARTPTS+${outroStartSeconds}/TB,format=rgba[outro];` +
      `[with-credit][outro]overlay=0:0:eof_action=pass:shortest=0:format=auto:` +
      `enable='gte(t,${outroStartSeconds})',format=yuv420p[v];` +
      `[1:a]asetpts=PTS-STARTPTS,aresample=48000,` +
      `aformat=sample_fmts=fltp:channel_layouts=stereo,` +
      `apad=whole_dur=${durationSeconds},atrim=duration=${durationSeconds}[a]`,
    "-map", "[v]",
    "-map", "[a]",
    "-map_metadata", "-1",
    "-map_chapters", "-1",
    "-t", String(durationSeconds),
    "-r", String(framesPerSecond),
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", "18",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outputPath,
  ]);
}

function parseFrameRate(value) {
  if (typeof value !== "string") return Number.NaN;
  const [numerator, denominator = "1"] = value.split("/");
  const divisor = Number(denominator);
  return divisor === 0 ? Number.NaN : Number(numerator) / divisor;
}

export function validateLaunchCaptureProbe(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Raw launch capture metadata is invalid.");
  }
  const streams = Array.isArray(value.streams) ? value.streams : [];
  const videoStreams = streams.filter((stream) => stream?.codec_type === "video");
  const video = videoStreams[0];
  if (videoStreams.length !== 1 || video?.width !== captureWidth || video?.height !== captureHeight) {
    throw new Error("Raw launch capture must contain one 1600x900 video stream.");
  }
  return Object.freeze({ width: video.width, height: video.height });
}

export function validateLaunchAudioProbe(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Launch audio metadata is invalid.");
  }
  const duration = Number(value.format?.duration);
  const streams = Array.isArray(value.streams) ? value.streams : [];
  const audio = streams.length === 1 ? streams[0] : undefined;
  if (
    !Number.isFinite(duration) || duration < durationSeconds - 0.01 || duration > durationSeconds + 0.1 ||
    audio?.codec_type !== "audio" || audio.sample_rate !== "48000" || audio.channels !== 2
  ) {
    throw new Error(
      "Launch audio must be one continuous 68-second stereo 48 kHz stream; shorter audio would create a silent tail.",
    );
  }
  return Object.freeze({ duration });
}

export function resolveLaunchOutroFrameSeconds(value) {
  const rawDuration = Number(value);
  if (!Number.isFinite(rawDuration) || rawDuration <= 0) {
    throw new Error("Raw launch capture duration is invalid.");
  }
  // A complete interaction may legitimately finish before the authored
  // master. Use its final decodable frame in that case; tpad owns the quiet
  // hold up to the editorial outro, so seeking past EOF must never be needed.
  return Math.min(outroStartSeconds, Math.max(0, rawDuration - 0.25));
}

export function validateLaunchCreditProbe(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Launch credit metadata is invalid.");
  }
  const streams = Array.isArray(value.streams) ? value.streams : [];
  const video = streams.length === 1 ? streams[0] : undefined;
  if (
    video?.codec_type !== "video" || video.codec_name !== "png" ||
    video.width !== outputWidth || video.height !== outputHeight || video.pix_fmt !== "rgba"
  ) {
    throw new Error("Launch credit must be one transparent 1440x810 PNG.");
  }
  return Object.freeze({ width: video.width, height: video.height });
}

export function validateLaunchOutroSourceProbe(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Launch outro source metadata is invalid.");
  }
  const streams = Array.isArray(value.streams) ? value.streams : [];
  const video = streams.length === 1 ? streams[0] : undefined;
  if (
    video?.codec_type !== "video" || video.codec_name !== "png" ||
    video.width !== outputWidth || video.height !== outputHeight
  ) {
    throw new Error("Launch outro source must be one 1440x810 PNG.");
  }
  return Object.freeze({ width: video.width, height: video.height });
}

export function validateLaunchMediaProbe(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Final video metadata is invalid.");
  }
  const duration = Number(value.format?.duration);
  const streams = Array.isArray(value.streams) ? value.streams : [];
  const videoStreams = streams.filter((stream) => stream?.codec_type === "video");
  const audioStreams = streams.filter((stream) => stream?.codec_type === "audio");
  const video = videoStreams[0];
  const audio = audioStreams[0];
  if (!Number.isFinite(duration) || duration < 67.9 || duration > 68.1) {
    throw new Error("Final video duration is not sixty-eight seconds.");
  }
  if (streams.length !== 2 || videoStreams.length !== 1 || audioStreams.length !== 1) {
    throw new Error("Final video must contain exactly one visible stream and one audio stream.");
  }
  const frameRate = parseFrameRate(video.avg_frame_rate ?? video.r_frame_rate);
  if (
    video.codec_name !== "h264" || video.width !== outputWidth || video.height !== outputHeight ||
    video.pix_fmt !== "yuv420p" || !Number.isFinite(frameRate) ||
    Math.abs(frameRate - framesPerSecond) > 0.001
  ) {
    throw new Error("Final video stream does not match the frozen H.264 1440x810 30 fps profile.");
  }
  if (audio.codec_name !== "aac" || audio.sample_rate !== "48000" || audio.channels !== 2) {
    throw new Error("Final audio stream does not match the frozen stereo AAC 48 kHz profile.");
  }
  for (const [label, stream] of [["Video", video], ["Audio", audio]]) {
    const streamDuration = Number(stream.duration);
    if (!Number.isFinite(streamDuration) || streamDuration < 67.85 || streamDuration > 68.15) {
      throw new Error(`${label} stream duration is not sixty-eight seconds.`);
    }
  }
  return Object.freeze({ duration });
}

async function run(command, args, options = {}) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: options.env ?? process.env,
      stdio: "inherit",
      shell: false,
    });
    const forwardSignal = (signal) => child.kill(signal);
    process.once("SIGINT", forwardSignal);
    process.once("SIGTERM", forwardSignal);
    const releaseSignalHandlers = () => {
      process.off("SIGINT", forwardSignal);
      process.off("SIGTERM", forwardSignal);
    };
    child.once("error", (error) => {
      releaseSignalHandlers();
      rejectPromise(error);
    });
    child.once("exit", (code, signal) => {
      releaseSignalHandlers();
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(
        `${command} exited with ${signal === null ? `code ${code}` : `signal ${signal}`}.`,
      ));
    });
  });
}

async function read(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "inherit"],
      shell: false,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 64 * 1_024) child.kill("SIGTERM");
    });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0 && stdout.length <= 64 * 1_024) resolvePromise(stdout);
      else rejectPromise(new Error(
        `${command} exited with ${signal === null ? `code ${code}` : `signal ${signal}`}.`,
      ));
    });
  });
}

async function assertReadableFile(path, label) {
  await access(path);
  const details = await stat(path);
  if (!details.isFile() || details.size === 0) throw new Error(`${label} is not a readable non-empty file.`);
}

async function assertAbsent(path, label) {
  try {
    await access(path);
  } catch (error) {
    if (error !== null && typeof error === "object" && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`${label} already exists; choose a fresh output directory.`);
}

async function main() {
  const options = parseLaunchVideoArgs(process.argv.slice(2));
  console.log("Matter launch capture");
  console.log(`mode=${options.execute ? "execute" : options.renderExisting ? "render-existing" : "dry-run"}`);
  console.log(
    `browser=isolated Chromium; inquiryMode=${describeLaunchInquiryMode(options)}; ` +
    "duration=68s; capture=1600x900; output=1440x810",
  );
  console.log(`output=${options.outputDirectory}`);
  if (!options.execute && !options.renderExisting) {
    console.log(
      "No server, browser, microphone, provider, or encoder was started. " +
      "Add --execute --offline-demo --audio <path> to render a local publication take.",
    );
    return;
  }
  if (options.audioPath === null) {
    throw new Error("An operator-supplied audio file is required: --audio <path>.");
  }
  await assertReadableFile(options.audioPath, "Audio source");
  await mkdir(options.outputDirectory, { recursive: true });

  const rawVideoPath = resolve(options.outputDirectory, "matter-launch-raw.webm");
  const cuePath = resolve(options.outputDirectory, "capture-cues.json");
  const creditPath = resolve(options.outputDirectory, "matter-launch-credit.png");
  const outroSourcePath = resolve(options.outputDirectory, "matter-launch-outro-source.png");
  const outroFramesDirectory = resolve(options.outputDirectory, "matter-launch-outro-frames");
  const outroPattern = resolve(outroFramesDirectory, "frame-%04d.png");
  const finalVideoPath = resolve(options.outputDirectory, "matter-launch-master-68s.mp4");
  const partialVideoPath = resolve(options.outputDirectory, "matter-launch-master-68s.part.mp4");
  if (!options.renderExisting) {
    await assertAbsent(rawVideoPath, "Raw screen recording");
    await assertAbsent(cuePath, "Capture cue receipt");
  }
  await assertAbsent(creditPath, "Archival audio credit image");
  await assertAbsent(outroSourcePath, "Editorial outro source image");
  await assertAbsent(outroFramesDirectory, "Editorial outro frame sequence");
  await assertAbsent(finalVideoPath, "Final launch video");
  await assertAbsent(partialVideoPath, "Partial launch video");
  const e2eRunner = resolve(repositoryRoot, "scripts", "run-e2e.mjs");
  await assertReadableFile(e2eRunner, "Matter E2E runner");
  await read("ffmpeg", ["-version"]);
  await read("ffprobe", ["-version"]);
  validateLaunchAudioProbe(JSON.parse(await read("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,sample_rate,channels",
    "-of", "json",
    options.audioPath,
  ])));

  if (!options.renderExisting) {
    await run(process.execPath, [
      e2eRunner,
      "--config=studio/film/playwright.config.ts",
    ], {
      env: launchVideoCaptureEnvironment(options, {
        ...process.env,
        MATTER_LAUNCH_RAW_WEBM: rawVideoPath,
        MATTER_LAUNCH_RUN_DIR: options.outputDirectory,
      }),
    });
  }
  await assertReadableFile(rawVideoPath, "Raw screen recording");
  await assertReadableFile(cuePath, "Capture cue receipt");
  const rawProbe = JSON.parse(await read("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,width,height",
    "-of", "json",
    rawVideoPath,
  ]));
  validateLaunchCaptureProbe(rawProbe);
  const outroFrameSeconds = resolveLaunchOutroFrameSeconds(rawProbe.format?.duration);
  const captureCues = JSON.parse(await readFile(cuePath, "utf8"));
  const cameraWindows = parseLaunchCaptureCues(captureCues);
  const openingRoot = parseLaunchOpeningRootCue(captureCues);
  await renderLaunchVideoCredit(creditPath);
  await assertReadableFile(creditPath, "Archival audio credit image");
  validateLaunchCreditProbe(JSON.parse(await read("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt",
    "-of", "json",
    creditPath,
  ])));
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel", "warning",
    "-n",
    "-i", rawVideoPath,
    "-ss", String(outroFrameSeconds),
    "-frames:v", "1",
    "-vf", `scale=${outputWidth}:${outputHeight}:flags=lanczos,format=rgb24`,
    "-update", "1",
    outroSourcePath,
  ]);
  await assertReadableFile(outroSourcePath, "Editorial outro source image");
  validateLaunchOutroSourceProbe(JSON.parse(await read("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt",
    "-of", "json",
    outroSourcePath,
  ])));
  await renderLaunchVideoOutro(outroSourcePath, outroFramesDirectory);
  await assertReadableFile(
    resolve(outroFramesDirectory, "frame-0000.png"),
    "First editorial outro frame",
  );
  await assertReadableFile(
    resolve(outroFramesDirectory, `frame-${String(outroFrameCount - 1).padStart(4, "0")}.png`),
    "Last editorial outro frame",
  );

  let partialOwned = true;
  let metadata;
  try {
    await run(
      "ffmpeg",
      launchVideoFfmpegArgs(
        rawVideoPath,
        options.audioPath,
        creditPath,
        outroPattern,
        partialVideoPath,
        cameraWindows,
        openingRoot,
      ),
    );
    await assertReadableFile(partialVideoPath, "Partial launch video");
    metadata = validateLaunchMediaProbe(JSON.parse(await read("ffprobe", [
      "-v", "error",
      "-show_entries",
      "format=duration:stream=codec_type,codec_name,duration,width,height,pix_fmt," +
        "sample_rate,channels,avg_frame_rate,r_frame_rate",
      "-of", "json",
      partialVideoPath,
    ])));
    await rename(partialVideoPath, finalVideoPath);
    partialOwned = false;
  } finally {
    if (partialOwned) await rm(partialVideoPath, { force: true });
  }
  await assertReadableFile(finalVideoPath, "Final launch video");

  console.log(`raw=${rawVideoPath}`);
  console.log(`cues=${cuePath}`);
  console.log(`credit=${creditPath}`);
  console.log(`outro=${outroFramesDirectory}`);
  console.log(`final=${finalVideoPath}`);
  console.log(`duration=${metadata.duration.toFixed(3)}s`);
  console.log("rights=operator-supplied audio; verify publication permission before distribution");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
