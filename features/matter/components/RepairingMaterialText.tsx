import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { AdmissionRepairCommittedChange } from "../store/matter-store";
import { planRepairReveal } from "../interaction/repair-reveal";

export function RepairingMaterialText({
  change,
  text,
}: {
  change: AdmissionRepairCommittedChange | undefined;
  text: string;
}): ReactNode {
  const plan = change === undefined ? null : planRepairReveal(change.before.text, text);
  if (plan === null) return text;

  return (
    <span
      className="repair-text"
      data-repair-reveal-count={plan.revealUnitCount}
      data-repair-reveal-total-ms={plan.totalMs}
    >
      {plan.parts.map((part, index) => {
        if (part.revealIndex === null) {
          return <Fragment key={`stable_${index}`}>{part.text}</Fragment>;
        }
        const style: CSSProperties = {
          animationDelay: `${plan.holdMs + part.revealIndex * plan.stepMs}ms`,
          animationDuration: `${plan.settleMs}ms`,
        };
        return (
          <span
            className="repair-text__grapheme"
            data-repair-part="changed"
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
