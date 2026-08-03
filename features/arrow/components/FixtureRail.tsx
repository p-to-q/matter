import { INITIAL_SAMPLE, PROTOCOL_VERSION, type ActionPlan } from "../engine/protocol";
import { planToSceneCommand } from "../engine/scene-engine";
import { useArrowStore } from "../store/arrow-store";

const fixtureVersions = [
  {
    id: "quiet",
    label: "v1",
    text: INITIAL_SAMPLE,
  },
  {
    id: "expanded",
    label: "v2",
    text: "我们怀念的也许不是一个真实存在过的过去，而是那个过去在今天仍然允许我们想象几种还没有被彻底放弃的生活。",
  },
  {
    id: "precise",
    label: "v3",
    text: "我们怀念的也许不是过去本身，而是它在今天仍然保留的一点余地：让另一种生活继续显得可能。",
  },
] as const;

export function FixtureRail() {
  const scene = useArrowStore((state) => state.scene);
  const phase = useArrowStore((state) => state.phase);
  const commit = useArrowStore((state) => state.commit);
  const sample = scene.objects.thought_sample;
  const locked = [
    "requesting-permission",
    "transcribing",
    "planning",
    "applying",
    "listening",
  ].includes(phase);

  if (!sample || sample.type !== "thought") return null;

  const activeVersion =
    fixtureVersions.find((version) => version.text === sample.text)?.id ?? "custom";

  return (
    <aside className="fixture-rail" aria-label="Fixture AI versions">
      <span className="fixture-rail__mark">fixture</span>
      <span className="fixture-rail__ai">AI adjustable</span>
      <span className="fixture-rail__versions" aria-label="Generated versions">
        {fixtureVersions.map((version) => (
          <button
            type="button"
            className="fixture-version"
            data-active={activeVersion === version.id}
            aria-label={`Apply ${version.label} fixture version`}
            title={`Apply ${version.label}`}
            disabled={locked || activeVersion === version.id}
            key={version.id}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => {
              const current = useArrowStore.getState().scene;
              const currentSample = current.objects.thought_sample;
              if (!currentSample || currentSample.type !== "thought") return;
              const plan: ActionPlan = {
                protocolVersion: PROTOCOL_VERSION,
                interactionId: `fixture_version_${version.id}_${current.revision}`,
                sceneRevision: current.revision,
                actions: [
                  {
                    id: `fixture_version_action_${version.id}_${current.revision}`,
                    type: "replace-text-range",
                    objectId: currentSample.id,
                    start: 0,
                    end: currentSample.text.length,
                    text: version.text,
                    intent: "refine",
                  },
                ],
                presentation: {
                  focusObjectIds: [currentSample.id],
                  motionHint: "settle",
                },
              };
              commit(planToSceneCommand(current, plan));
            }}
          >
            {version.label}
          </button>
        ))}
      </span>
    </aside>
  );
}
