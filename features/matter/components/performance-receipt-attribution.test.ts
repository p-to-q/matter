import { describe, expect, it } from "vitest";
import { attributeColdCanvasTasks } from "./performance-receipt-attribution";

const marks = {
  initial: 100,
  measured: 160,
  laidOut: 240,
  published: 300,
} as const;

describe("cold canvas receipt attribution", () => {
  it("keeps raw timing without assigning a causal stage across in-task marks", () => {
    expect(attributeColdCanvasTasks([
      { startTime: 120, duration: 150 },
      { startTime: 275, duration: 10 },
      { startTime: 420, duration: 60 },
    ], marks)).toEqual([
      {
        startTime: 120,
        duration: 150,
        endTime: 270,
        overlapsColdCanvas: true,
        overlappingMarks: ["measured", "laidOut"],
        stage: null,
      },
      {
        startTime: 275,
        duration: 10,
        endTime: 285,
        overlapsColdCanvas: true,
        overlappingMarks: [],
        stage: "laidOut → published",
      },
      {
        startTime: 420,
        duration: 60,
        endTime: 480,
        overlapsColdCanvas: false,
        overlappingMarks: [],
        stage: "published → after",
      },
    ]);
  });

  it("remains a total diagnostic when a browser cannot expose every mark", () => {
    expect(attributeColdCanvasTasks(
      [{ startTime: Number.NaN, duration: -4 }],
      { initial: null, published: 40 },
    )).toEqual([
      {
        startTime: 0,
        duration: 0,
        endTime: 0,
        overlapsColdCanvas: false,
        overlappingMarks: [],
        stage: null,
      },
    ]);
  });
});
