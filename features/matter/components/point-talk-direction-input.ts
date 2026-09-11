import { MAX_TEXT_SWAP_DIRECTION_CODE_POINTS } from "../protocol/text-swap-policy";

/** Keeps the visible draft inside the same Unicode-scalar bound as the wire. */
export function constrainPointTalkDirectionInput(value: string): string {
  const codePoints = Array.from(value);
  return codePoints.length <= MAX_TEXT_SWAP_DIRECTION_CODE_POINTS
    ? value
    : codePoints.slice(0, MAX_TEXT_SWAP_DIRECTION_CODE_POINTS).join("");
}
