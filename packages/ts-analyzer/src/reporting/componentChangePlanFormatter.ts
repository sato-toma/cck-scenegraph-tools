import { ComponentChangePlan } from "../analysis/componentChangePlan";
import { ComponentRequirementOccurrence } from "../domain/types";

function formatOccurrenceEvidence(
  occurrence: ComponentRequirementOccurrence,
): string {
  const condition =
    occurrence.condition.kind === "conditional"
      ? occurrence.condition.expression ?? "conditional"
      : occurrence.condition.kind === "unknown"
        ? "unknown"
        : "";
  const conditional =
    condition.length > 0 ? ` (condition: ${condition})` : "";
  const { filePath, line, column } = occurrence.source;
  return `${filePath}:${line}:${column}${conditional} — ${occurrence.evidence}`;
}

export function formatComponentChangePlan(
  plan: ComponentChangePlan,
): string {
  const lines = [
    "=== Component Change Plan ===",
    `Plan: ${plan.id}`,
    `Project: ${plan.project}`,
    `Unity scene: ${plan.scenePath}`,
    `SceneGraph input: ${plan.sceneGraphPath}`,
    `Status: ${plan.status}`,
    "",
    "Planned additions:",
  ];

  if (plan.actions.length === 0) {
    lines.push("  (No safe, concrete additions identified)");
  }

  for (const [index, action] of plan.actions.entries()) {
    lines.push(`  ${index + 1}. Add ${action.componentType}`);
    lines.push(
      `     Target: ${action.target.gameObjectPath} (${action.target.gameObjectId})`,
    );
    lines.push(
      action.kind === "optional-lookup"
        ? `     Optional lookup suggestion from: ${action.apis.join(", ")}`
        : `     Required by: ${action.apis.join(", ")}`,
    );
    if (action.kind === "optional-lookup") {
      lines.push(
        "     This addition is optional; approve it only if a null lookup result is unintended.",
      );
    }
    lines.push(
      `     Settings: ${action.settings.resolution === "resolved" ? JSON.stringify(action.settings.values) : "not resolved; confirm values or explicitly confirm no additional settings"}`,
    );
    for (const occurrence of action.evidence) {
      lines.push(`     Evidence: ${formatOccurrenceEvidence(occurrence)}`);
    }
    lines.push(
      `     Expected result: ${action.expectedResult === "satisfied-after-reexport" ? "Exporter re-export confirms the listed requirement is satisfied." : action.expectedResult}`,
    );
    const sideEffects = action.sideEffects.map((effect) => {
      if (effect === "runtime-effects-not-statically-verified") {
        return "Runtime effects are not statically verified";
      }
      return "No existing component is removed or replaced";
    });
    lines.push(`     Side effects: ${sideEffects.join("; ")}.`);
  }

  if (plan.reviewItems.length > 0) {
    lines.push("", "Requirements needing review:");
    for (const item of plan.reviewItems) {
      lines.push(
        `  - ${item.api}: ${item.verificationStatus} (${item.reason})`,
      );
      lines.push(`    ${item.explanation}`);
      if (item.target.resolution === "resolved") {
        lines.push(
          `    Target: ${item.target.gameObjectPath ?? "(path unavailable)"} (${item.target.gameObjectId ?? "ID unavailable"})`,
        );
      } else if (item.target.candidates?.length) {
        lines.push("    Candidate targets:");
        for (const candidate of item.target.candidates) {
          lines.push(
            `      - ${candidate.gameObjectPath} (${candidate.gameObjectId})`,
          );
        }
      } else {
        lines.push("    Target: unresolved");
      }
      for (const occurrence of item.evidence) {
        lines.push(
          `    Evidence: ${formatOccurrenceEvidence(occurrence)}`,
        );
      }
      if (item.disposition === "excluded") {
        lines.push(`    Excluded from this plan: ${item.exclusionReason}`);
      }
    }
  }

  if (plan.status === "needs-user-input") {
    lines.push(
      "",
      "No changes may be applied. Resolve every setting and review item, then present the complete plan for explicit user approval.",
    );
  } else if (plan.status === "ready-for-approval") {
    lines.push(
      "",
      "No changes have been applied. Ask the user to explicitly approve this exact plan before handing it to an application step.",
    );
  } else if (plan.status === "approved") {
    lines.push("", `Approved at: ${plan.approval?.approvedAt}`);
  } else if (plan.status === "rejected") {
    lines.push("", "The plan was rejected; it must not be applied.");
  }

  return lines.join("\n");
}
