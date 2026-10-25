import * as path from "path";
import { pathToFileURL } from "url";
import type {
  AnalysisResult,
  ComponentRequirementRequest,
  ValidationIssue,
} from "../domain/types";

export const ANALYSIS_REPORT_FORMATS = [
  "text",
  "json",
  "sarif",
  "github-actions",
  "vscode-problems",
] as const;

const SARIF_VERSION = "2.1.0";
const SARIF_SCHEMA_URL = `https://json.schemastore.org/sarif-${SARIF_VERSION}.json`;

export type AnalysisReportFormat = (typeof ANALYSIS_REPORT_FORMATS)[number];
export type StructuredAnalysisReportFormat = Exclude<
  AnalysisReportFormat,
  "text"
>;

type SarifLevel = "error" | "warning" | "note";

interface SarifLocation {
  physicalLocation: {
    artifactLocation: {
      uri: string;
    };
    region: {
      startLine: number;
      startColumn: number;
    };
  };
}

interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: {
    text: string;
  };
  locations?: SarifLocation[];
  properties?: Record<string, unknown>;
}

interface SarifRule {
  id: string;
  shortDescription: {
    text: string;
  };
  defaultConfiguration: {
    level: SarifLevel;
  };
}

export function formatJsonAnalysisReport(results: AnalysisResult[]): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      results,
    },
    null,
    2,
  );
}

export function formatSarifAnalysisReport(
  results: AnalysisResult[],
  workingDirectory = process.cwd(),
  workspaceRoot = process.env.GITHUB_WORKSPACE ?? workingDirectory,
): string {
  const rules = new Map<string, SarifRule>();
  const sarifResults: SarifResult[] = [];

  for (const analysisResult of results) {
    for (const request of analysisResult.componentRequests) {
      if (request.verificationStatus === "satisfied") {
        continue;
      }

      const ruleId =
        request.kind === "optional-lookup" &&
        request.verificationStatus === "missing"
          ? "component-lookup-missing"
          : `component-requirement-${request.verificationStatus}`;
      const shortDescription =
        request.kind === "optional-lookup" &&
        request.verificationStatus === "missing"
          ? "Optional Unity component lookup is not found"
          : `Component requirement is ${request.verificationStatus}`;
      const level = getRequirementLevel(request);
      rules.set(ruleId, {
        id: ruleId,
        shortDescription: {
          text: shortDescription,
        },
        defaultConfiguration: { level },
      });
      sarifResults.push({
        ruleId,
        level,
        message: {
          text: describeComponentRequirement(request),
        },
        locations: request.occurrences.map((occurrence) => ({
          physicalLocation: {
            artifactLocation: {
              uri: getSarifUri(
                occurrence.source.filePath,
                workingDirectory,
                workspaceRoot,
              ),
            },
            region: {
              startLine: Math.max(1, occurrence.source.line),
              startColumn: Math.max(1, occurrence.source.column + 1),
            },
          },
        })),
        properties: {
          componentRequest: request,
        },
      });
    }

    for (const issue of analysisResult.issues) {
      if (isReportedByComponentRequest(issue, analysisResult.componentRequests)) {
        continue;
      }

      const ruleId = issue.code;
      const level = getIssueLevel(issue);
      rules.set(ruleId, {
        id: ruleId,
        shortDescription: { text: issue.message },
        defaultConfiguration: { level },
      });
      sarifResults.push({
        ruleId,
        level,
        message: { text: issue.message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: getSarifUri(
                  analysisResult.filePath,
                  workingDirectory,
                  workspaceRoot,
                ),
              },
              region: {
                startLine: Math.max(1, issue.line),
                startColumn: Math.max(1, issue.column + 1),
              },
            },
          },
        ],
        properties: {
          apiCall: issue.apiCall,
          requiredComponents: issue.requiredComponents,
          availableComponents: issue.availableComponents,
        },
      });
    }
  }

  return JSON.stringify(
    {
      $schema: SARIF_SCHEMA_URL,
      version: SARIF_VERSION,
      runs: [
        {
          tool: {
            driver: {
              name: "CCK ClusterScript Analyzer",
              rules: Array.from(rules.values()),
            },
          },
          results: sarifResults,
        },
      ],
    },
    null,
    2,
  );
}

export function formatGitHubActionsAnnotations(
  results: AnalysisResult[],
  workingDirectory = process.cwd(),
  workspaceRoot = process.env.GITHUB_WORKSPACE ?? workingDirectory,
): string {
  const annotations: string[] = [];

  for (const analysisResult of results) {
    for (const request of analysisResult.componentRequests) {
      if (request.verificationStatus === "satisfied") {
        continue;
      }

      const level = getRequirementLevel(request);
      const message = describeComponentRequirement(request);
      for (const occurrence of request.occurrences) {
        annotations.push(
          formatGitHubAnnotation(
            level === "error" ? "error" : "warning",
            occurrence.source.filePath,
            occurrence.source.line,
            occurrence.source.column,
            request.kind === "optional-lookup"
              ? "CCK optional component lookup"
              : `CCK ${request.verificationStatus}`,
            message,
            workingDirectory,
            workspaceRoot,
          ),
        );
      }
    }

    for (const issue of analysisResult.issues) {
      if (isReportedByComponentRequest(issue, analysisResult.componentRequests)) {
        continue;
      }

      annotations.push(
        formatGitHubAnnotation(
          issue.severity === "info"
            ? "notice"
            : issue.severity === "error"
              ? "error"
              : "warning",
          analysisResult.filePath,
          issue.line,
          issue.column,
          `CCK ${issue.code}`,
          issue.message,
          workingDirectory,
          workspaceRoot,
        ),
      );
    }
  }

  return annotations.join("\n");
}

export function formatVSCodeProblems(
  results: AnalysisResult[],
  workingDirectory = process.cwd(),
): string {
  const problems: string[] = [];

  for (const analysisResult of results) {
    for (const request of analysisResult.componentRequests) {
      if (request.verificationStatus === "satisfied") {
        continue;
      }

      const level = getRequirementLevel(request);
      const code =
        request.kind === "optional-lookup" &&
        request.verificationStatus === "missing"
          ? "SCENEGRAPH_COMPONENT_LOOKUP_MISSING"
          : `SCENEGRAPH_COMPONENT_${request.verificationStatus.toUpperCase()}`;
      const message = toSingleLine(describeComponentRequirement(request));
      for (const occurrence of request.occurrences) {
        problems.push(
          formatVSCodeProblem(
            occurrence.source.filePath,
            occurrence.source.line,
            occurrence.source.column,
            level === "error" ? "error" : "warning",
            code,
            message,
            workingDirectory,
          ),
        );
      }
    }

    for (const issue of analysisResult.issues) {
      if (isReportedByComponentRequest(issue, analysisResult.componentRequests)) {
        continue;
      }

      problems.push(
        formatVSCodeProblem(
          analysisResult.filePath,
          issue.line,
          issue.column,
          issue.severity,
          `SCENEGRAPH_${issue.code}`,
          toSingleLine(issue.message),
          workingDirectory,
        ),
      );
    }
  }

  return problems.join("\n");
}

export function formatStructuredAnalysisReport(
  format: StructuredAnalysisReportFormat,
  results: AnalysisResult[],
  workingDirectory = process.cwd(),
  workspaceRoot = process.env.GITHUB_WORKSPACE ?? workingDirectory,
): string {
  switch (format) {
    case "json":
      return formatJsonAnalysisReport(results);
    case "sarif":
      return formatSarifAnalysisReport(
        results,
        workingDirectory,
        workspaceRoot,
      );
    case "github-actions":
      return formatGitHubActionsAnnotations(
        results,
        workingDirectory,
        workspaceRoot,
      );
    case "vscode-problems":
      return formatVSCodeProblems(results, workingDirectory);
  }
}

function getRequirementLevel(
  request: ComponentRequirementRequest,
): SarifLevel {
  return request.severity === "error" ||
    (request.verificationStatus === "missing" &&
      request.kind !== "optional-lookup")
    ? "error"
    : "warning";
}

function getIssueLevel(issue: ValidationIssue): SarifLevel {
  if (issue.severity === "error") {
    return "error";
  }
  return issue.severity === "warning" ? "warning" : "note";
}

function describeComponentRequirement(
  request: ComponentRequirementRequest,
): string {
  const requirement =
    request.componentMatch === "any"
      ? `one of ${request.componentTypes.join(" | ")}`
      : request.componentTypes.join(", ") || "an unsupported component type";
  const target =
    request.target.resolution === "resolved"
      ? ` on ${request.target.gameObjectPath ?? "the resolved GameObject"}`
      : request.target.resolution === "ambiguous"
        ? ` (ambiguous target: ${(request.target.candidates ?? []).map((candidate) => candidate.gameObjectPath).join(", ") || "multiple GameObjects"})`
        : " (target unresolved)";
  const reason = request.verificationReason
    ? `: ${request.verificationReason}`
    : "";

  if (request.kind === "optional-lookup") {
    return `${request.api} looked up ${requirement}${target} (${request.verificationStatus})${reason}`;
  }

  return `${request.api} requires ${requirement}${target} (${request.verificationStatus})${reason}`;
}

function isReportedByComponentRequest(
  issue: ValidationIssue,
  requests: ComponentRequirementRequest[],
): boolean {
  if (issue.code !== "MISSING_COMPONENT") {
    return false;
  }

  const issueApi = normalizeApiName(issue.apiCall);
  return requests.some(
    (request) =>
      request.verificationStatus === "missing" &&
      normalizeApiName(request.api) === issueApi &&
      request.occurrences.some(
        ({ source }) =>
          source.line === issue.line && source.column === issue.column,
      ),
  );
}

function normalizeApiName(api: string): string {
  return api.replace(/^\$\./, "").replace(/\(\)$/, "");
}

function getSarifUri(
  filePath: string,
  workingDirectory: string,
  workspaceRoot: string,
): string {
  const absolutePath = path.resolve(workingDirectory, filePath);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (
    relativePath &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  ) {
    return relativePath.split(path.sep).join("/");
  }

  return pathToFileURL(absolutePath).href;
}

function formatGitHubAnnotation(
  level: "error" | "warning" | "notice",
  filePath: string,
  line: number,
  column: number,
  title: string,
  message: string,
  workingDirectory: string,
  workspaceRoot: string,
): string {
  const absolutePath = path.resolve(workingDirectory, filePath);
  const relativePath = path.relative(workspaceRoot, absolutePath);
  const annotationPath =
    relativePath &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
      ? relativePath.split(path.sep).join("/")
      : absolutePath;
  const properties = [
    `file=${escapeGitHubProperty(annotationPath)}`,
    `line=${Math.max(1, line)}`,
    `col=${Math.max(1, column + 1)}`,
    `title=${escapeGitHubProperty(title)}`,
  ].join(",");

  return `::${level} ${properties}::${escapeGitHubData(message)}`;
}

function escapeGitHubProperty(value: string): string {
  return value
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

function escapeGitHubData(value: string): string {
  return value
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

function formatVSCodeProblem(
  filePath: string,
  line: number,
  column: number,
  severity: "error" | "warning" | "info",
  code: string,
  message: string,
  workingDirectory: string,
): string {
  const absolutePath = path.resolve(workingDirectory, filePath);
  return `${absolutePath}(${Math.max(1, line)},${Math.max(1, column + 1)}): ${severity} ${code}: ${message}`;
}

function toSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ");
}
