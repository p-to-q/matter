export type FilmCopy = Readonly<{
  version: 1;
  locale: "zh-CN";
  document: Readonly<{
    title: string;
    titleSentence: string;
    rootSource: string;
    rootSuffix: string;
    expandedRoot: string;
  }>;
  material: Readonly<{
    voice: string;
    thirdBranch: string;
    nestedBranch: string;
  }>;
  pointTalk: Readonly<{
    passage: string;
    direction: string;
    result: string;
  }>;
  inquiry: Readonly<{ question: string; answer: string }>;
  ui: Readonly<{
    renameCanvas: string;
    topLevelVoice: string;
    selectGuidance: string;
    darkAppearance: string;
    aboutDialog: string;
    aboutClose: string;
    settingsMenu: string;
    modelApi: string;
    speakGuidance: string;
    materializingGuidance: string;
    rewriteVoice: string;
    done: string;
    listening: string;
    rewriting: string;
    lowerGrip: string;
    expanding: string;
    askMatter: string;
    inquiryField: string;
  }>;
}>;

export function parseFilmCopy(markdown: string): FilmCopy;
export const FILM_COPY: FilmCopy;
