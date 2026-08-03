export function clampStretchAmount(value: number) {
  return Math.max(-1, Math.min(1, value));
}

export function stretchAmountFromDrag(
  initialAmount: number,
  deltaY: number,
  side: "top" | "bottom",
  travel = 120,
) {
  const direction = side === "bottom" ? 1 : -1;
  return clampStretchAmount(initialAmount + (deltaY * direction) / travel);
}

export function targetCharacterRange(currentLength: number, amount: number) {
  const normalized = clampStretchAmount(amount);
  if (normalized >= 0) {
    const target = Math.round(currentLength * (1 + normalized * 3.2));
    return {
      min: Math.max(currentLength, Math.round(target * 0.85)),
      max: Math.min(800, Math.max(currentLength + 1, Math.round(target * 1.15))),
    };
  }

  const target = Math.max(4, Math.round(currentLength * (1 + normalized * 0.75)));
  return {
    min: Math.max(2, target - 4),
    max: Math.max(4, target + 4),
  };
}
