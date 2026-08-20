import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { MaterialTextCommittedChange } from "../store/matter-store";
import { planTransformReveal } from "../interaction/transform-reveal";

export function TransformingMaterialText({
  change,
  text,
}: {
  change: MaterialTextCommittedChange | undefined;
  text: string;
}): ReactNode {
  const plan = change === undefined ? null : planTransformReveal(change.before.text, text);
  if (plan === null) return text;

  return (
    <span
      className="transform-text"
      data-transform-motion={change?.motionHint}
      data-transform-reveal-groups={plan.groupCount}
      data-transform-reveal-total-ms={plan.totalMs}
    >
      {plan.parts.map((part, index) => {
        if (part.group === null) {
          return <Fragment key={`stable_${index}`}>{part.text}</Fragment>;
        }
        const style: CSSProperties = {
          animationDelay: `${plan.holdMs + part.group * plan.stepMs}ms`,
          animationDuration: `${plan.settleMs}ms`,
        };
        return (
          <span
            className="transform-text__group"
            data-transform-part="changed"
            key={`changed_${index}`}
            style={style}
          >
            {part.text}
          </span>
        );
      })}
    </span>
  );
}
