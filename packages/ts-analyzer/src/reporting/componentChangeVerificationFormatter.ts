import type {
  ComponentChangeCheckStatus,
  ComponentChangeVerificationReport,
} from "../analysis/componentChangePlan/verification";

function displayStatus(status: ComponentChangeCheckStatus): string {
  switch (status) {
    case "verified":
      return "verified";
    case "failed":
      return "failed";
    case "unverified":
      return "unverified";
  }
}

export function formatComponentChangeVerificationReport(
  report: ComponentChangeVerificationReport,
): string {
  const lines = [
    `Component change verification: ${report.status.toUpperCase()}`,
    `SceneGraph: ${report.sceneGraphPath}`,
    `Unity log: ${report.logPath}`,
    "",
  ];

  if (report.applicationError) {
    lines.push(`Application failed: ${report.applicationError}`);
  }
  if (report.exportError) {
    lines.push(`Export or analysis failed: ${report.exportError}`);
  }

  for (const action of report.actions) {
    lines.push(
      `${action.componentType} on ${action.target.hierarchyPath} (${action.target.globalObjectId})`,
      `  component: ${displayStatus(action.componentStatus)}`,
      `  enabled: ${displayStatus(action.enabledStatus)}`,
      `  settings: ${displayStatus(action.settingsStatus)}`,
      `  static requirement: ${displayStatus(action.analysisStatus)}`,
    );
    for (const message of action.messages) {
      lines.push(`  - ${message}`);
    }
  }

  for (const result of report.analysisResults) {
    lines.push(
      `Analysis: ${result.filePath} (${result.issues.length} issue(s))`,
    );
    for (const issue of result.issues) {
      lines.push(
        `  ${issue.severity.toUpperCase()} ${issue.code} at ${issue.line}:${issue.column}: ${issue.message}`,
      );
    }
  }

  lines.push(
    "",
    "Runtime behavior: NOT VERIFIED. This report verifies exported scene data and static requirements only.",
  );
  return lines.join("\n");
}
