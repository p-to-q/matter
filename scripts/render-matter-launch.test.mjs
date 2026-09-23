import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  describeLaunchInquiryMode,
  launchVideoCameraFilter,
  launchVideoCaptureEnvironment,
  launchVideoCreditMarkup,
  launchVideoFfmpegArgs,
  launchOpeningFocusMask,
  launchVideoOutroMarkup,
  parseLaunchCaptureCues,
  parseLaunchOpeningRootCue,
  parseLaunchVideoArgs,
  resolveLaunchOutroFrameSeconds,
  validateLaunchCaptureProbe,
  validateLaunchAudioProbe,
  validateLaunchCreditProbe,
  validateLaunchMediaProbe,
  validateLaunchOutroSourceProbe,
} from "./render-matter-launch.mjs";

const captureCues = Object.freeze({
  version: 12,
  durationMs: 68_000,
  width: 1_600,
  height: 900,
  cues: [
    {
      name: "opening-root",
      milliseconds: 40,
      bounds: { left: 540, top: 370, width: 520, height: 160 },
    },
    {
      name: "about-start",
      milliseconds: 5_700,
      bounds: { left: 910, top: 170, width: 420, height: 440 },
    },
    {
      name: "about-end",
      milliseconds: 8_250,
      bounds: { left: 910, top: 170, width: 420, height: 440 },
    },
    {
      name: "voice-tool-start",
      milliseconds: 10_800,
      bounds: { left: 700, top: 650, width: 48, height: 48 },
    },
    {
      name: "voice-tool-active",
      milliseconds: 11_600,
      bounds: { left: 696, top: 646, width: 56, height: 56 },
    },
    {
      name: "voice-tool-end",
      milliseconds: 12_550,
      bounds: { left: 698, top: 648, width: 52, height: 52 },
    },
    {
      name: "point-talk-start",
      milliseconds: 17_000,
      bounds: { left: 180, top: 100, width: 320, height: 180 },
    },
    {
      name: "point-talk-end",
      milliseconds: 23_000,
      bounds: { left: 220, top: 120, width: 360, height: 220 },
    },
    {
      name: "elastic-start",
      milliseconds: 30_000,
      bounds: { left: 500, top: 300, width: 500, height: 220 },
    },
    {
      name: "elastic-confirm",
      milliseconds: 34_100,
      bounds: { left: 480, top: 280, width: 560, height: 280 },
    },
    {
      name: "elastic-end",
      milliseconds: 38_000,
      bounds: { left: 480, top: 280, width: 560, height: 280 },
    },
    {
      name: "inquiry-start",
      milliseconds: 39_200,
      bounds: { left: 1_120, top: 560, width: 360, height: 250 },
    },
    {
      name: "inquiry-end",
      milliseconds: 50_000,
      bounds: { left: 1_080, top: 520, width: 420, height: 300 },
    },
    {
      name: "undo-start",
      milliseconds: 52_000,
      bounds: { left: 24, top: 650, width: 48, height: 48 },
    },
    {
      name: "undo-commit",
      milliseconds: 52_900,
      bounds: { left: 24, top: 650, width: 48, height: 48 },
    },
    {
      name: "undo-end",
      milliseconds: 54_100,
      bounds: { left: 24, top: 650, width: 48, height: 48 },
    },
  ],
  requests: { transcribe: 3, transform: 1, textSwap: 1, inquiry: 1 },
  inquiryMode: "fixture",
  document: { title: "被允许想象的其他生活" },
  presentation: {
    opening: { theme: "light", leafFx: "off", ambient: "poster" },
    daylight: { theme: "light", leafFx: "on", ambient: "video" },
    night: { theme: "dark", leafFx: "on", ambient: "video" },
  },
  events: {
    "daylight-leaf": 4_100,
    night: 5_100,
    about: 6_200,
    "model-api": 9_500,
    "voice-recording": 12_550,
    "voice-transcribing": 13_400,
    "voice-material": 14_500,
    "point-talk-transcribed": 21_000,
    "point-talk-commit": 22_500,
    "nested-branch": 25_000,
    "elastic-commit": 37_500,
    "elastic-deselected": 39_000,
    "branch-held-aside": 41_000,
    "inquiry-answer": 49_000,
    "branch-restored": 51_000,
    "undo-elastic": 52_900,
    "undo-nested-branch": 53_600,
    "undo-third-branch": 54_300,
    "undo-point-talk": 55_000,
    "undo-first-branch": 55_700,
    "undo-voice-branch": 56_400,
  },
});

function finalProbe(overrides = {}) {
  return {
    format: { duration: "68.000000" },
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        duration: "68.000000",
        width: 1_440,
        height: 810,
        pix_fmt: "yuv420p",
        avg_frame_rate: "30/1",
      },
      {
        codec_type: "audio",
        codec_name: "aac",
        duration: "68.000000",
        sample_rate: "48000",
        channels: 2,
      },
    ],
    ...overrides,
  };
}

test("launch capture is dry and offline by default in a fresh ignored destination", () => {
  const parsed = parseLaunchVideoArgs([], new Date("2026-09-05T10:20:30.000Z"));
  assert.equal(parsed.execute, false);
  assert.equal(parsed.renderExisting, false);
  assert.equal(parsed.liveInquiry, false);
  assert.equal(parsed.offlineDemo, false);
  assert.equal(parsed.audioPath, null);
  assert.match(parsed.outputDirectory, /tmp\/matter-launch-video\/2026-09-05T10-20-30-000Z$/u);
  assert.deepEqual(
    launchVideoCaptureEnvironment(parsed, { KEEP: "yes" }),
    { KEEP: "yes", MATTER_LAUNCH_LIVE_INQUIRY: "false", MATTER_LAUNCH_OFFLINE_DEMO: "false" },
  );
  assert.equal(describeLaunchInquiryMode(parsed), "unselected");
});

test("launch capture resolves operator paths and opts into one live inquiry explicitly", () => {
  const parsed = parseLaunchVideoArgs([
    "--execute",
    "--live-inquiry",
    "--audio=./voice.wav",
    "--output-dir",
    "./tmp/take-one",
  ]);
  assert.equal(parsed.execute, true);
  assert.equal(parsed.renderExisting, false);
  assert.equal(parsed.liveInquiry, true);
  assert.equal(parsed.offlineDemo, false);
  assert.match(parsed.audioPath, /\/voice\.wav$/u);
  assert.match(parsed.outputDirectory, /\/tmp\/take-one$/u);
  assert.deepEqual(
    launchVideoCaptureEnvironment(parsed, { KEEP: "yes" }),
    { KEEP: "yes", MATTER_LAUNCH_LIVE_INQUIRY: "true", MATTER_LAUNCH_OFFLINE_DEMO: "false" },
  );
  assert.equal(describeLaunchInquiryMode(parsed), "live");
});

test("launch capture opts into a receipt-marked offline demo without provider egress", () => {
  const parsed = parseLaunchVideoArgs([
    "--execute",
    "--offline-demo",
    "--audio=./voice.wav",
    "--output-dir=./tmp/take-offline",
  ]);
  assert.equal(parsed.execute, true);
  assert.equal(parsed.liveInquiry, false);
  assert.equal(parsed.offlineDemo, true);
  assert.deepEqual(
    launchVideoCaptureEnvironment(parsed, { KEEP: "yes" }),
    { KEEP: "yes", MATTER_LAUNCH_LIVE_INQUIRY: "false", MATTER_LAUNCH_OFFLINE_DEMO: "true" },
  );
  assert.equal(describeLaunchInquiryMode(parsed), "fixture");
});

test("existing capture rendering is offline and requires its explicit run directory", () => {
  const parsed = parseLaunchVideoArgs([
    "--render-existing",
    "--audio=./voice.wav",
    "--output-dir=./tmp/take-one",
  ]);
  assert.equal(parsed.execute, false);
  assert.equal(parsed.renderExisting, true);
  assert.equal(parsed.liveInquiry, false);
  assert.equal(parsed.offlineDemo, false);
  assert.match(parsed.outputDirectory, /\/tmp\/take-one$/u);
  assert.deepEqual(
    launchVideoCaptureEnvironment(parsed, { KEEP: "yes" }),
    { KEEP: "yes", MATTER_LAUNCH_LIVE_INQUIRY: "false", MATTER_LAUNCH_OFFLINE_DEMO: "false" },
  );
  assert.equal(describeLaunchInquiryMode(parsed), "recorded-receipt");
});

test("capture cues freeze six non-overlapping, semantically motivated camera windows", () => {
  const windows = parseLaunchCaptureCues(captureCues);
  assert.deepEqual(
    {
      startFrame: windows.voiceTool.startFrame,
      activeFrame: windows.voiceTool.activeFrame,
      endFrame: windows.voiceTool.endFrame,
      riseFrames: windows.voiceTool.riseFrames,
      settleFrames: windows.voiceTool.settleFrames,
      exitFrames: windows.voiceTool.exitFrames,
      overshoot: windows.voiceTool.overshoot,
      maxZoom: windows.voiceTool.maxZoom,
      peakZoom: windows.voiceTool.peakZoom,
    },
    {
      startFrame: 324,
      activeFrame: 348,
      endFrame: 401,
      riseFrames: 14,
      settleFrames: 5,
      exitFrames: 17,
      overshoot: 0.045,
      maxZoom: 3.2,
      peakZoom: 3.344,
    },
  );
  assert.deepEqual(
    {
      startFrame: windows.undoTool.startFrame,
      commitFrame: windows.undoTool.commitFrame,
      endFrame: windows.undoTool.endFrame,
      riseFrames: windows.undoTool.riseFrames,
      settleFrames: windows.undoTool.settleFrames,
      exitFrames: windows.undoTool.exitFrames,
      overshoot: windows.undoTool.overshoot,
      maxZoom: windows.undoTool.maxZoom,
      peakZoom: windows.undoTool.peakZoom,
    },
    {
      startFrame: 1_560,
      commitFrame: 1_587,
      endFrame: 1_623,
      riseFrames: 16,
      settleFrames: 7,
      exitFrames: 24,
      overshoot: 0.04,
      maxZoom: 2.45,
      peakZoom: 2.548,
    },
  );
  assert.deepEqual(
    {
      startFrame: windows.pointTalk.startFrame,
      endFrame: windows.pointTalk.endFrame,
      riseFrames: windows.pointTalk.riseFrames,
      settleFrames: windows.pointTalk.settleFrames,
      entryFrames: windows.pointTalk.entryFrames,
      exitFrames: windows.pointTalk.exitFrames,
      overshoot: windows.pointTalk.overshoot,
      maxZoom: windows.pointTalk.maxZoom,
      peakZoom: windows.pointTalk.peakZoom,
    },
    {
      startFrame: 510,
      endFrame: 690,
      riseFrames: 16,
      settleFrames: 10,
      entryFrames: 26,
      exitFrames: 24,
      overshoot: 0.06,
      maxZoom: 1.68,
      peakZoom: 1.7808,
    },
  );
  assert.deepEqual(
    {
      startFrame: windows.elastic.startFrame,
      endFrame: windows.elastic.endFrame,
      confirmFrame: windows.elastic.confirmFrame,
      riseFrames: windows.elastic.riseFrames,
      settleFrames: windows.elastic.settleFrames,
      exitFrames: windows.elastic.exitFrames,
      overshoot: windows.elastic.overshoot,
      maxZoom: windows.elastic.maxZoom,
      peakZoom: windows.elastic.peakZoom,
    },
    {
      startFrame: 900,
      endFrame: 1140,
      confirmFrame: 1023,
      riseFrames: 20,
      settleFrames: 8,
      exitFrames: 28,
      overshoot: 0.035,
      maxZoom: 1.62,
      peakZoom: 1.6767,
    },
  );
  assert.deepEqual(
    {
      riseFrames: windows.inquiry.riseFrames,
      settleFrames: windows.inquiry.settleFrames,
      entryFrames: windows.inquiry.entryFrames,
      exitFrames: windows.inquiry.exitFrames,
      overshoot: windows.inquiry.overshoot,
      maxZoom: windows.inquiry.maxZoom,
      peakZoom: windows.inquiry.peakZoom,
    },
    {
      riseFrames: 24,
      settleFrames: 0,
      entryFrames: 24,
      exitFrames: 30,
      overshoot: 0,
      maxZoom: 1.55,
      peakZoom: 1.55,
    },
  );
  assert.deepEqual(
    windows.voiceTool.targetBounds,
    { left: 696, top: 646, width: 56, height: 56 },
  );
  assert.deepEqual(
    windows.pointTalk.targetBounds,
    { left: 180, top: 100, width: 400, height: 240 },
  );
  assert.equal(windows.pointTalk.centerX, 500);
  assert.ok(windows.pointTalk.centerY > 252 && windows.pointTalk.centerY < 253);
  assert.ok(windows.inquiry.centerX > 1_083 && windows.inquiry.centerX < 1_085);
  assert.ok(windows.inquiry.centerY > 609 && windows.inquiry.centerY < 611);
});

test("large DOM targets reduce zoom so spring peaks retain safe framing", () => {
  const widened = {
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name.startsWith("point-talk-")
      ? { ...cue, bounds: { left: 300, top: 260, width: 800, height: 300 } }
      : cue),
  };
  const windows = parseLaunchCaptureCues(widened);
  assert.ok(windows.pointTalk.maxZoom < 1.68);
  assert.ok(windows.pointTalk.maxZoom > 1.5);
  assert.ok(windows.pointTalk.peakZoom <= 1_600 / (800 + 64 * 2));
});

test("Voice tool framing unions all three states and safety-fits its close-up", () => {
  const widened = {
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name.startsWith("voice-tool-")
      ? { ...cue, bounds: { left: 500, top: 300, width: 450, height: 180 } }
      : cue),
  };
  const voiceTool = parseLaunchCaptureCues(widened).voiceTool;
  assert.deepEqual(
    voiceTool.targetBounds,
    { left: 500, top: 300, width: 450, height: 180 },
  );
  assert.ok(voiceTool.maxZoom > 3.02 && voiceTool.maxZoom < 3.03);
  assert.ok(voiceTool.peakZoom <= 1_600 / (450 + 28 * 2));
});

test("Elastic framing includes the explicit confirmation geometry", () => {
  const widenedConfirmation = {
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "elastic-confirm"
      ? { ...cue, bounds: { left: 430, top: 250, width: 700, height: 330 } }
      : cue),
  };
  assert.deepEqual(
    parseLaunchCaptureCues(widenedConfirmation).elastic.targetBounds,
    { left: 430, top: 250, width: 700, height: 330 },
  );
});

test("camera filter gives all six windows distinct motion and only Elastic a pulse", () => {
  const filter = launchVideoCameraFilter(parseLaunchCaptureCues(captureCues));
  assert.match(filter, /^zoompan=/u);
  assert.match(filter, /\+2\.2\*/u);
  assert.match(filter, /\+0\.68\*/u);
  assert.match(filter, /\+0\.62\*/u);
  assert.match(filter, /\+0\.55\*/u);
  assert.match(filter, /\+1\.45\*/u);
  assert.match(filter, /\(on-324\)\/14/u);
  assert.match(filter, /\(on-338\)\/5/u);
  assert.match(filter, /\(401-on\)\/17/u);
  assert.match(filter, /\(on-510\)\/16/u);
  assert.match(filter, /\(on-526\)\/10/u);
  assert.match(filter, /\(690-on\)\/24/u);
  assert.match(filter, /\(on-900\)\/20/u);
  assert.match(filter, /\(on-920\)\/8/u);
  assert.match(filter, /\(1140-on\)\/28/u);
  assert.match(filter, /\(on-1176\)\/24/u);
  assert.match(filter, /\(1500-on\)\/30/u);
  assert.match(filter, /\(on-1560\)\/16/u);
  assert.match(filter, /\(on-1576\)\/7/u);
  assert.match(filter, /\(1623-on\)\/24/u);
  assert.doesNotMatch(filter, /\/0(?:\D|$)/u);
  assert.match(filter, /\*6-15\)\+10/u);
  assert.match(filter, /0\.025\*if\(between\(on,1023,1037\),sin\(PI\*\(on-1023\)\/14\),0\)/u);
  assert.match(filter, /between\(on,324,400\)/u);
  assert.match(filter, /between\(on,510,689\)/u);
  assert.match(filter, /between\(on,900,1139\)/u);
  assert.match(filter, /between\(on,1176,1499\)/u);
  assert.match(filter, /between\(on,1560,1622\)/u);
  assert.match(filter, /max\(0,min\(iw-iw\/zoom/u);
  assert.match(filter, /s=1440x810:fps=30$/u);
  assert.equal(filter.match(/sin\(/gu)?.length, 1);
  assert.doesNotMatch(filter, /drawtext|overlay|fade/u);
});

test("ffmpeg accepts the generated per-window camera expression", { skip: false }, (context) => {
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
    context.skip("ffmpeg is unavailable");
    return;
  }
  const filter = launchVideoCameraFilter(parseLaunchCaptureCues(captureCues));
  const result = spawnSync("ffmpeg", [
    "-v", "error",
    "-f", "lavfi",
    "-i", "color=c=black:s=1600x900:r=30:d=0.04",
    "-vf", filter,
    "-frames:v", "1",
    "-f", "null",
    "-",
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("opening focus is derived from captured material pixels, not duplicate text", () => {
  const openingRoot = parseLaunchOpeningRootCue(captureCues);
  assert.deepEqual(openingRoot, {
    milliseconds: 40,
    bounds: { left: 540, top: 370, width: 520, height: 160 },
  });
  assert.equal(
    launchOpeningFocusMask(openingRoot),
    "color=c=black:s=1440x810:r=30:d=3.7,format=gray," +
      "drawbox=x=438:y=299:w=564:h=212:color=white:t=fill,boxblur=28:2",
  );
});

test("ffmpeg creates one metadata-free 68-second H.264/AAC master", () => {
  const windows = parseLaunchCaptureCues(captureCues);
  const args = launchVideoFfmpegArgs(
    "raw.webm",
    "voice.wav",
    "credit.png",
    "outro/frame-%04d.png",
    "master.mp4",
    windows,
    parseLaunchOpeningRootCue(captureCues),
  );
  const filter = args[args.indexOf("-filter_complex") + 1];
  assert.deepEqual(args.slice(-3), ["-movflags", "+faststart", "master.mp4"]);
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("192k"));
  assert.deepEqual(args.slice(args.indexOf("-map_metadata"), args.indexOf("-map_metadata") + 2), [
    "-map_metadata", "-1",
  ]);
  assert.deepEqual(args.slice(args.indexOf("-map_chapters"), args.indexOf("-map_chapters") + 2), [
    "-map_chapters", "-1",
  ]);
  assert.match(filter, /tpad=stop_mode=clone:stop_duration=68/u);
  assert.match(filter, /trim=duration=68/u);
  assert.match(filter, /zoompan=/u);
  assert.match(filter, /gblur=sigma=18/u);
  assert.match(filter, /color=c=white@0\.70/u);
  assert.match(filter, /\[opening-veil\]/u);
  assert.match(filter, /drawbox=x=1020:y=710:w=420:h=100/u);
  assert.match(filter, /boxblur=24:2\[opening-chrome-mask\]/u);
  assert.match(filter, /\[deep-soft-clean\]\[opening-root-sharp\]/u);
  assert.match(filter, /format=rgba,lut=a=255,fade=t=out/u);
  assert.match(filter, /\[opening-root-sharp\]/u);
  assert.doesNotMatch(filter, /gblur=sigma=3\.5/u);
  assert.match(filter, /maskedmerge/u);
  assert.match(filter, /boxblur=28:2/u);
  assert.match(filter, /fade=t=out:st=2\.35:d=1\.3:alpha=1/u);
  assert.match(filter, /fade=t=in:st=0\.15:d=0\.45:alpha=1/u);
  assert.match(filter, /fade=t=out:st=1\.95:d=0\.7:alpha=1/u);
  assert.match(filter, /overlay=0:0[^;]*enable='lt\(t,2\.75\)'/u);
  assert.match(filter, /setpts=PTS-STARTPTS\+63\.5\/TB/u);
  assert.match(filter, /enable='gte\(t,63\.5\)'/u);
  assert.match(filter, /aresample=48000/u);
  assert.doesNotMatch(filter, /afade=/u);
  assert.doesNotMatch(filter, /atempo=/u);
  assert.doesNotMatch(filter, /adelay=/u);
  assert.match(filter, /channel_layouts=stereo/u);
  assert.match(filter, /apad=whole_dur=68/u);
  assert.match(filter, /atrim=duration=68/u);
  assert.deepEqual(args.slice(args.indexOf("-r"), args.indexOf("-r") + 2), ["-r", "30"]);
  assert.deepEqual(args.slice(4, 13), [
    "-i", "raw.webm", "-i", "voice.wav", "-loop", "1", "-framerate", "30", "-i",
  ]);
  assert.ok(args.includes("outro/frame-%04d.png"));
});

test("the archival master must cover the picture through its final fade", () => {
  assert.deepEqual(validateLaunchAudioProbe({
    format: { duration: "68.000000" },
    streams: [{ codec_type: "audio", sample_rate: "48000", channels: 2 }],
  }), { duration: 68 });
  assert.throws(
    () => validateLaunchAudioProbe({
      format: { duration: "52.000000" },
      streams: [{ codec_type: "audio", sample_rate: "48000", channels: 2 }],
    }),
    /silent tail/u,
  );
});

test("the archival audio credit is transparent, restrained, and outside product DOM", () => {
  const markup = launchVideoCreditMarkup();
  assert.match(markup, /Douglas Engelbart/u);
  assert.match(markup, /<em>The Mother of All Demos\.<\/em>/u);
  assert.match(markup, /background:transparent/u);
  assert.match(markup, /right:56px;bottom:72px;width:620px/u);
  assert.match(markup, /font-size:21px;font-weight:300;line-height:1\.38/u);
  assert.match(markup, /<span>1968 demonstration, since known as<\/span>/u);
  assert.doesNotMatch(markup, /script|data-thought|matter-document/ui);
  assert.deepEqual(validateLaunchCreditProbe({ streams: [{
    codec_type: "video",
    codec_name: "png",
    width: 1_440,
    height: 810,
    pix_fmt: "rgba",
  }] }), { width: 1_440, height: 810 });
  assert.throws(() => validateLaunchCreditProbe({ streams: [{
    codec_type: "video",
    codec_name: "png",
    width: 1_440,
    height: 810,
    pix_fmt: "rgb24",
  }] }), /Launch credit/u);
});

test("the outro returns the real root-only night paper to haze before it departs", () => {
  const markup = launchVideoOutroMarkup("data:image/png;base64,AAAA");
  assert.match(markup, /data:image\/png;base64,AAAA/u);
  assert.match(markup, /renderMatterOutro/u);
  assert.match(markup, /'#030506'/u);
  assert.match(markup, /roundedRect/u);
  assert.match(markup, /pictureBlur=ease\(\(progress-\.06\)\/\.40\)/u);
  assert.match(markup, /departure=ease\(\(progress-\.18\)\/\.54\)/u);
  assert.match(markup, /blur\('\+lerp\(0,4,pictureBlur\)/u);
  assert.doesNotMatch(markup, /lerp\(0,22,pictureBlur\)|backgroundExit|bleed/u);
  assert.equal(markup.match(/ctx\.drawImage\(source/gu)?.length, 1);
  assert.match(markup, /lerp\(1,\.78,departure\)/u);
  assert.match(markup, /12\*rounding/u);
  assert.match(markup, /drawImage\(source,x,y,width,height\)/u);
  assert.doesNotMatch(markup, /scan|sweep|beam|nodes|edges|fillText|p → q|被允许想象的其他生活/ui);
  assert.deepEqual(validateLaunchOutroSourceProbe({ streams: [{
    codec_type: "video",
    codec_name: "png",
    width: 1_440,
    height: 810,
    pix_fmt: "rgb24",
  }] }), { width: 1_440, height: 810 });
  assert.throws(() => validateLaunchOutroSourceProbe({ streams: [{
    codec_type: "video",
    codec_name: "png",
    width: 1_600,
    height: 900,
  }] }), /1440x810/u);
});

test("invalid launch options and camera receipts fail before rendering", () => {
  assert.throws(() => parseLaunchVideoArgs(["--publish"]), /Unknown launch-video option/u);
  assert.throws(() => parseLaunchVideoArgs(["--audio", "--execute"]), /--audio requires a value/u);
  assert.throws(
    () => parseLaunchVideoArgs(["--execute", "--audio=voice.wav"]),
    /explicit Inquiry mode/u,
  );
  assert.throws(
    () => parseLaunchVideoArgs(["--render-existing", "--audio=voice.wav"]),
    /requires the existing --output-dir/u,
  );
  assert.throws(
    () => parseLaunchVideoArgs([
      "--render-existing",
      "--live-inquiry",
      "--audio=voice.wav",
      "--output-dir=tmp/take",
    ]),
    /performs no capture/u,
  );
  assert.throws(
    () => parseLaunchVideoArgs(["--execute", "--live-inquiry", "--offline-demo"]),
    /mutually exclusive/u,
  );
  assert.throws(() => parseLaunchCaptureCues({ ...captureCues, durationMs: 63_000 }), /68-second/u);
  assert.throws(() => parseLaunchCaptureCues({ ...captureCues, version: 9 }), /unsupported version/u);
  assert.throws(() => parseLaunchOpeningRootCue({
    ...captureCues,
    cues: captureCues.cues.filter((cue) => cue.name !== "opening-root"),
  }), /opening-root/u);
  assert.throws(() => parseLaunchOpeningRootCue({
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "opening-root"
      ? { ...cue, milliseconds: 300 }
      : cue),
  }), /after the opening settled/u);
  assert.throws(() => parseLaunchOpeningRootCue({
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "opening-root"
      ? { ...cue, bounds: { ...cue.bounds, left: 690, top: 310 } }
      : cue),
  }), /not centered/u);
  assert.throws(() => parseLaunchCaptureCues({ ...captureCues, inquiryMode: "unknown" }), /Inquiry mode/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    document: { title: "Matter" },
  }), /authored canvas title/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    requests: { ...captureCues.requests, inquiry: 0 },
  }), /three Transcription requests/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    requests: { ...captureCues.requests, transcribe: 2 },
  }), /three Transcription requests/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    presentation: { ...captureCues.presentation, night: { theme: "light", leafFx: "on", ambient: "video" } },
  }), /paper-light sequence/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    events: { ...captureCues.events, "undo-voice-branch": 66_000 },
  }), /early night and quiet ending/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.filter((cue) => cue.name !== "voice-tool-active"),
  }), /voice-tool-active/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.filter((cue) => cue.name !== "inquiry-end"),
  }), /inquiry-end/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.filter((cue) => cue.name !== "elastic-confirm"),
  }), /elastic-confirm/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.filter((cue) => cue.name !== "undo-commit"),
  }), /undo-commit/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "point-talk-end"
      ? { ...cue, milliseconds: 15_800 }
      : cue),
  }), /too short/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "voice-tool-end"
      ? { ...cue, milliseconds: 8_400 }
      : cue),
  }), /voiceTool camera window is too short/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "inquiry-end"
      ? { ...cue, milliseconds: 35_400 }
      : cue),
  }), /inquiry camera window is too short/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "inquiry-start"
      ? { ...cue, milliseconds: 30_500 }
      : cue),
  }), /overlap/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "point-talk-start"
      ? { ...cue, bounds: { ...cue.bounds, left: -1 } }
      : cue),
  }), /outside the capture surface/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "elastic-confirm"
      ? { ...cue, milliseconds: 27_400 }
      : cue),
  }), /stable elastic hold/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "voice-tool-active"
      ? { ...cue, milliseconds: 9_500 }
      : cue),
  }), /stable voiceTool hold/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "voice-tool-active"
      ? { ...cue, milliseconds: 7_500 }
      : cue),
  }), /stable voiceTool hold/u);
  assert.throws(() => parseLaunchCaptureCues({
    ...captureCues,
    cues: captureCues.cues.map((cue) => cue.name === "undo-commit"
      ? { ...cue, milliseconds: 52_300 }
      : cue),
  }), /stable undoTool hold/u);
});

test("raw capture receipt requires one 1600x900 video stream", () => {
  assert.deepEqual(validateLaunchCaptureProbe({
    streams: [{ codec_type: "video", width: 1_600, height: 900 }],
  }), { width: 1_600, height: 900 });
  assert.throws(() => validateLaunchCaptureProbe({
    streams: [{ codec_type: "video", width: 1_440, height: 810 }],
  }), /1600x900/u);
});

test("outro source seeks to the authored cut or the last decodable raw frame", () => {
  assert.equal(resolveLaunchOutroFrameSeconds(68), 63.5);
  assert.ok(Math.abs(resolveLaunchOutroFrameSeconds(62) - 61.75) < 1e-9);
  assert.throws(() => resolveLaunchOutroFrameSeconds(0), /duration/u);
});

test("the final receipt requires a 68-second 1440x810 30 fps H.264/AAC master", () => {
  assert.deepEqual(validateLaunchMediaProbe(finalProbe()), { duration: 68 });
  assert.throws(() => validateLaunchMediaProbe(finalProbe({ format: { duration: "55.2" } })), /duration/u);
  assert.throws(() => validateLaunchMediaProbe({
    ...finalProbe(),
    streams: [finalProbe().streams[0]],
  }), /audio stream/u);
  assert.throws(() => validateLaunchMediaProbe({
    ...finalProbe(),
    streams: finalProbe().streams.map((stream, index) => index === 0
      ? { ...stream, avg_frame_rate: "60/1" }
      : stream),
  }), /30 fps/u);
  assert.throws(() => validateLaunchMediaProbe({
    ...finalProbe(),
    streams: finalProbe().streams.map((stream, index) => index === 0
      ? { ...stream, avg_frame_rate: undefined }
      : stream),
  }), /30 fps/u);
  assert.throws(() => validateLaunchMediaProbe({
    ...finalProbe(),
    streams: finalProbe().streams.map((stream, index) => index === 0
      ? { ...stream, codec_name: "vp9" }
      : stream),
  }), /H\.264/u);
  assert.throws(() => validateLaunchMediaProbe({
    ...finalProbe(),
    streams: finalProbe().streams.map((stream, index) => index === 1
      ? { ...stream, sample_rate: "44100" }
      : stream),
  }), /48 kHz/u);
});
