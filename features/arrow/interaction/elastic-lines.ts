import { segmentText } from "./text-segments";

export function elasticRowCount(amount: number, unitCount: number) {
  const requested = 1 + Math.round(Math.max(0, Math.min(1, amount)) * 5);
  return Math.max(1, Math.min(requested, unitCount));
}

export function elasticGridHeight(amount: number, rowCount: number) {
  const gestureHeight = 54 + Math.max(0, Math.min(1, amount)) * 230;
  const contentHeight = rowCount * 52 + 14;
  return Math.max(54, Math.round(Math.max(gestureHeight, contentHeight)));
}

export function distributeElasticLines(text: string, amount: number): string[][] {
  const units: string[] = [];
  for (const segment of segmentText(text)) {
    if (segment.selectable || units.length === 0) units.push(segment.text);
    else units[units.length - 1] += segment.text;
  }
  if (units.length === 0) return [];

  const rowCount = elasticRowCount(amount, units.length);
  const rows: string[][] = [];
  let cursor = 0;

  for (let row = 0; row < rowCount; row += 1) {
    const remainingUnits = units.length - cursor;
    const remainingRows = rowCount - row;
    const lineSize = Math.ceil(remainingUnits / remainingRows);
    rows.push(units.slice(cursor, cursor + lineSize));
    cursor += lineSize;
  }

  return rows;
}
