import type {
  ComponentChangeCheckStatus,
  ComponentChangeVerificationReport,
} from "../analysis/componentChangePlan/verification";
import {
  COMPONENT_CHANGE_CHECK_STATUSES,
  COMPONENT_CHANGE_VERIFICATION_STATUSES,
} from "../analysis/componentChangePlan/verification";

function displayStatus(status: ComponentChangeCheckStatus): string {
  switch (status) {
    case COMPONENT_CHANGE_CHECK_STATUSES.verified:
      return "verified";
    case COMPONENT_CHANGE_CHECK_STATUSES.failed:
      return "failed";
    case COMPONENT_CHANGE_CHECK_STATUSES.unverified:
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
      `  change: ${action.changeStatus}`,
      `  component: ${displayStatus(action.componentStatus)}`,
      `  enabled: ${displayStatus(action.enabledStatus)}`,
      `  settings: ${displayStatus(action.settingsStatus)}`,
      `  requested settings: ${JSON.stringify(action.requestedSettings)}`,
      `  exported settings: ${JSON.stringify(action.exportedSettings)}`,
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
    `Runtime behavior: ${COMPONENT_CHANGE_VERIFICATION_STATUSES.unverified.toUpperCase()}. This report verifies exported scene data and static requirements only.`,
  );
  return lines.join("\n");
}
