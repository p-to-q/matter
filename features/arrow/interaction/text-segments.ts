export type TextSegment = {
  text: string;
  start: number;
  end: number;
  selectable: boolean;
};

export function segmentText(text: string, locale = "zh-CN"): TextSegment[] {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
    return [...segmenter.segment(text)].map((part) => ({
      text: part.segment,
      start: part.index,
      end: part.index + part.segment.length,
      selectable: part.segment.trim().length > 0,
    }));
  }

  return Array.from(text).map((character, index) => ({
    text: character,
    start: index,
    end: index + character.length,
    selectable: character.trim().length > 0,
  }));
}
