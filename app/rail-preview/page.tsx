import {
  BranchIcon,
  LassoIcon,
  MoveIcon,
  UndoIcon,
  VoiceIcon,
} from "@/features/matter/components/icons";
import styles from "./page.module.css";

type RailStudyVersion = Readonly<{
  id: string;
  number: string;
  title: string;
  commit: string;
  note: string;
  railClassNames: readonly ("rounded" | "release")[];
}>;

const versions: readonly RailStudyVersion[] = [
  {
    id: "original",
    number: "01",
    title: "Initial Matter demo",
    commit: "eb70973 / 3ccbe9c",
    note: "Compact paper instrument",
    railClassNames: [],
  },
  {
    id: "rounded",
    number: "02",
    title: "Fixture preview",
    commit: "917e9e9",
    note: "The fuller, rounder version",
    railClassNames: ["rounded"],
  },
  {
    id: "release",
    number: "03",
    title: "Preview release",
    commit: "e4851af",
    note: "Same rounded geometry, darker state",
    railClassNames: ["rounded", "release"],
  },
  {
    id: "working",
    number: "04",
    title: "Preview.3 candidate",
    commit: "current release geometry",
    note: "Compact return",
    railClassNames: [],
  },
];

const tools = [VoiceIcon, LassoIcon, BranchIcon, MoveIcon, UndoIcon];

export default function RailPreviewPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>MATTER / RAIL STUDY</p>
          <h1>Four instrument proportions</h1>
        </div>
        <p className={styles.instruction}>Hover a tool to see the active tile.</p>
      </header>

      <section className={styles.grid} aria-label="Four historical tool rail versions">
        {versions.map((version, index) => (
          <article className={styles.card} key={version.id}>
            <div className={styles.cardMeta}>
              <span className={styles.index}>{version.number}</span>
              <div>
                <h2>{version.title}</h2>
                <p>{version.commit}</p>
              </div>
            </div>

            <div className={styles.scene}>
              <div className={styles.paper}>
                <span className={styles.paperMark}>p -&gt; q</span>
                <span className={styles.paperLine} />
                <span className={styles.paperWord}>unfinished material</span>
                <div
                  className={[styles.rail, ...version.railClassNames.map((name) => styles[name])].join(" ")}
                  aria-label={`${version.title} tool rail`}
                >
                  {tools.map((Icon, toolIndex) => (
                    <span className={styles.toolWrap} key={toolIndex}>
                      <button className={`${styles.tool} ${toolIndex === index % tools.length ? styles.active : ""}`} type="button" aria-label="Preview tool">
                        <Icon />
                      </button>
                      {toolIndex === 0 || toolIndex === 3 ? <span className={styles.separator} /> : null}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <footer className={styles.cardFooter}>
              <span>{version.note}</span>
              <span className={styles.measure}>{version.railClassNames.includes("rounded") ? "22 / 13" : "16 / 10"}</span>
            </footer>
          </article>
        ))}
      </section>
    </main>
  );
}
