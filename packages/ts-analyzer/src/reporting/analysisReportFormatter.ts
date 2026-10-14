import { ClusterScriptDefinitions } from "../rules/clusterScriptDefinitions";
import { ConstraintValidator } from "../validation/constraintValidator";
import {
  COMPONENT_REQUIREMENT_STATUSES,
  formatComponentRequirementStatusCounts,
  summarizeComponentRequirements,
} from "../analysis/componentRequirements/summary";
import { SceneGraphParser } from "../sceneGraph/sceneGraphParser";
import { TypeScriptCodeParser } from "../analysis/typeScriptParser";
import {
  AnalysisResult,
  SceneGraph,
} from "../domain/types";

const ANSI = {
  reset: "\u001b[0m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  green: "\u001b[32m",
  bold: "\u001b[1m",
};

function colorize(text: string, color: string): string {
  if (!process.stdout.isTTY || process.env.NO_COLOR !== undefined) {
    return text;
  }

  return `${color}${text}${ANSI.reset}`;
}

export class AnalysisReportFormatter {
  constructor(private readonly sceneGraph: SceneGraph) {}

  generateReport(results: Map<string, AnalysisResult>): string {
    const lines: string[] = [];

    lines.push("=== ClusterScript Component Constraint Analysis Report ===\n");
    lines.push(`Project: ${this.sceneGraph.project}`);
    lines.push(`Total GameObjects: ${this.sceneGraph.gameObjects.length}\n`);

    let totalIssues = 0;
    let totalErrors = 0;
    let totalWarnings = 0;
    const totalComponentRequestCounts = summarizeComponentRequirements([]);

    for (const [filePath, result] of results) {
      if (result.issues.length > 0 || result.componentRequests.length > 0) {
        lines.push(`\n📄 File: ${filePath}`);
        lines.push(`   Issues: ${result.summary.totalIssues}`);
        lines.push(`   Errors: ${result.summary.errorCount}`);
        lines.push(`   Warnings: ${result.summary.warningCount}`);

        for (const issue of result.issues) {
          const severityColor =
            issue.severity === "error" ? ANSI.red : ANSI.yellow;
          const severityLabel = colorize(
            `[${issue.severity.toUpperCase()}]`,
            severityColor,
          );

          lines.push(`   ${severityLabel} Line ${issue.line}:${issue.column}`);
          lines.push(
            `     ${colorize("API:", severityColor)} ${colorize(issue.apiCall, severityColor)}`,
          );
          lines.push(
            `     ${colorize("Message:", severityColor)} ${colorize(issue.message, severityColor)}`,
          );
          lines.push(
            `     ${colorize("Required:", severityColor)} ${colorize(issue.requiredComponents.join(", "), severityColor)}`,
          );
          lines.push(
            `     ${colorize("Available:", severityColor)} ${colorize(issue.availableComponents.join(", ") || "none", severityColor)}`,
          );
        }

        if (result.componentRequests.length > 0) {
          lines.push(this.generateComponentRequirementReport(result));
        }

        totalIssues += result.summary.totalIssues;
        totalErrors += result.summary.errorCount;
        totalWarnings += result.summary.warningCount;
        for (const status of COMPONENT_REQUIREMENT_STATUSES) {
          totalComponentRequestCounts[status] +=
            result.summary.componentRequestCounts[status];
        }
      }
    }

    lines.push(`\n${colorize("=== Summary ===", ANSI.bold)}`);
    lines.push(`Total Issues: ${totalIssues}`);
    lines.push(`${colorize("Total Errors", ANSI.red)}: ${totalErrors}`);
    lines.push(`${colorize("Total Warnings", ANSI.yellow)}: ${totalWarnings}`);
    lines.push(
      formatComponentRequirementStatusCounts(totalComponentRequestCounts),
    );

    const needsRequirementReview =
      totalComponentRequestCounts.missing > 0 ||
      totalComponentRequestCounts.ambiguous > 0 ||
      totalComponentRequestCounts.unsupported > 0 ||
      totalComponentRequestCounts.unverified > 0;
    if (totalIssues === 0 && !needsRequirementReview) {
      lines.push(colorize("✅ No issues found!", ANSI.green));
    } else if (totalIssues === 0) {
      lines.push(
        colorize(
          "⚠️ No confirmed validation issues; component requirements need review.",
          ANSI.yellow,
        ),
      );
    }

    return lines.join("\n");
  }

  generateComponentRequirementReport(result: AnalysisResult): string {
    const lines = ["   Component requirements:"];

    if (result.componentRequests.length === 0) {
      lines.push("     (No component requirements)");
      return lines.join("\n");
    }

    for (const request of result.componentRequests) {
      const componentTypes =
        request.componentMatch === "any"
          ? `one of ${request.componentTypes.join(" | ")}`
          : request.componentTypes.join(", ") || "(component type unknown)";
      const locations = request.occurrences
        .map(({ source, condition }) => {
          const when =
            condition.kind === "conditional"
              ? ` when (${condition.expression})`
              : condition.kind === "unknown"
                ? " under an unknown condition"
                : "";
          return `${source.line}:${source.column}${when}`;
        })
        .join(", ");

      lines.push(
        `     [${request.verificationStatus.toUpperCase()}] ${request.api} at ${locations}: ${componentTypes}`,
      );
      if (request.target.resolution === "resolved") {
        lines.push(
          `       Target: ${request.target.gameObjectPath} (${request.target.gameObjectId})`,
        );
      } else if (request.target.resolution === "ambiguous") {
        lines.push("       Target: ambiguous among:");
        for (const candidate of request.target.candidates ?? []) {
          lines.push(
            `         - ${candidate.gameObjectPath} (${candidate.gameObjectId})`,
          );
        }
      } else {
        lines.push("       Target: unresolved");
      }

      if (request.validation.presentComponentTypes.length > 0) {
        lines.push(
          `       Present: ${request.validation.presentComponentTypes.join(", ")}`,
        );
      }
      if (request.validation.missingComponentTypes.length > 0) {
        lines.push(
          `       Missing: ${request.validation.missingComponentTypes.join(", ")}`,
        );
      }
      for (const matched of request.validation.matchedComponents) {
        lines.push(
          `       Evidence: ${matched.componentType} on ${matched.gameObjectPath} (${matched.gameObjectId})`,
        );
      }
      if (request.verificationReason) {
        lines.push(`       Reason: ${request.verificationReason}`);
      }
      for (const occurrence of request.occurrences) {
        lines.push(`       Source: ${occurrence.evidence}`);
      }
    }

    return lines.join("\n");
  }

  generateSceneGraphReport(): string {
    const lines: string[] = [];

    lines.push("=== Scene Graph Structure ===\n");
    lines.push(SceneGraphParser.visualizeHierarchy(this.sceneGraph));

    lines.push("\n=== Component Distribution ===");
    const distribution = SceneGraphParser.analyzeComponentDistribution(
      this.sceneGraph,
    );

    for (const [componentType, count] of distribution) {
      lines.push(`  ${componentType}: ${count}`);
    }

    return lines.join("\n");
  }

  generateApiCoverageReport(tsFilePath: string): string {
    const apiCalls = TypeScriptCodeParser.extractApiCalls(tsFilePath);
    const usedMethods = new Set(apiCalls.map((call) => call.methodName));
    const allMethods = ClusterScriptDefinitions.getAllMethodNames();
    const lines: string[] = [];

    lines.push("=== ClusterScript API Coverage ===\n");
    lines.push(`File: ${tsFilePath}`);
    lines.push(`Used APIs: ${usedMethods.size} / ${allMethods.length}`);
    lines.push(
      `Coverage: ${((usedMethods.size / allMethods.length) * 100).toFixed(1)}%\n`,
    );

    lines.push("Used Methods:");
    for (const method of Array.from(usedMethods).sort()) {
      lines.push(`  ✓ ${method}`);
    }

    lines.push("\nUnused Methods:");
    const unusedMethods = allMethods.filter((method) => !usedMethods.has(method));
    for (const method of unusedMethods.slice(0, 10)) {
      lines.push(`  - ${method}`);
    }

    if (unusedMethods.length > 10) {
      lines.push(`  ... and ${unusedMethods.length - 10} more`);
    }

    return lines.join("\n");
  }

  generateRecommendedComponents(tsFilePath: string): string {
    const apiCalls = TypeScriptCodeParser.extractApiCalls(tsFilePath);
    const requiredComponents = new Set<string>();

    for (const call of apiCalls) {
      const constraints = ClusterScriptDefinitions.getMethodConstraints(
        call.methodName,
      );

      for (const constraint of constraints) {
        if (constraint.requirement === "required") {
          requiredComponents.add(
            ConstraintValidator.formatComponentType(constraint.componentType),
          );
        }
      }
    }

    const lines: string[] = [];
    lines.push("=== Recommended Components ===\n");
    lines.push(`Based on API usage in: ${tsFilePath}\n`);
    lines.push("Required Components:");

    for (const component of Array.from(requiredComponents).sort()) {
      lines.push(`  ✓ ${component}`);
    }

    if (requiredComponents.size === 0) {
      lines.push("  (No required components)");
    }

    return lines.join("\n");
  }
}
