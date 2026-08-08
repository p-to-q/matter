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
    expect(particles.every((particle) => Number.isInteger(particle.x) && Number.isInteger(particle.y))).toBe(true);
  });

  it("fades the trail back from the pointer", () => {
    const points = Array.from({ length: 24 }, (_, index) => ({ x: 10 + index, y: 20 }));
    const particles = projectOutsideLassoParticles(points, paper);
    const opacities = particles.map((particle) => particle.opacity);
    expect(opacities.at(0)).toBeLessThan(opacities.at(-1)!);
    expect(Math.min(...opacities)).toBeGreaterThan(0);
    expect(Math.max(...opacities)).toBeLessThanOrEqual(1);
    expect([...opacities].sort((a, b) => a - b)).toEqual(opacities);
  });

  it("bounds the render-only particle count", () => {
    const points = Array.from({ length: 400 }, (_, index) => ({ x: index, y: 20 }));
    expect(projectOutsideLassoParticles(points, paper)).toHaveLength(72);
  });
});
