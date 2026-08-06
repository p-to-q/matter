import { describe, expect, it } from "vitest";
import { projectOutsideLassoParticles } from "./lasso-particles";

const paper = { left: 100, top: 100, right: 500, bottom: 500 };

describe("projectOutsideLassoParticles", () => {
  it("keeps an inside-only stroke visually quiet", () => {
    expect(projectOutsideLassoParticles([{ x: 200, y: 200 }, { x: 300, y: 300 }], paper)).toEqual([]);
  });

  it("projects only sampled points outside the paper and scales distant marks", () => {
    const particles = projectOutsideLassoParticles([
      { x: 200, y: 200 }, { x: 210, y: 210 }, { x: 90, y: 120 }, { x: 80, y: 130 },
      { x: 20, y: 200 }, { x: 10, y: 210 },
    ], paper);
    expect(particles).toHaveLength(2);
    expect(particles.map((particle) => particle.size)).toEqual([2, 4]);
  });

  it("bounds the render-only particle count", () => {
    const points = Array.from({ length: 400 }, (_, index) => ({ x: index, y: 20 }));
    expect(projectOutsideLassoParticles(points, paper)).toHaveLength(72);
  });
});
