import * as path from "path";
import { describe, expect, it } from "vitest";
import type {
  AnalysisResult,
  ComponentRequirementRequest,
  ValidationIssue,
} from "../domain/types";
import {
  formatGitHubActionsAnnotations,
  formatJsonAnalysisReport,
  formatSarifAnalysisReport,
  formatVSCodeProblems,
} from "./structuredAnalysisFormatter";

const workspaceRoot = path.resolve("workspace");
const sourcePath = "packages/ts-analyzer/examples/demo.ts";

function createRequest(
  overrides: Partial<ComponentRequirementRequest>,
): ComponentRequirementRequest {
  return {
    id: "request-on-collide",
    api: "$.onCollide",
    componentTypes: ["UnityEngine.Rigidbody"],
    componentMatch: "all",
    target: {
      kind: "current-scriptable-item",
      resolution: "resolved",
      gameObjectId: "item-id",
      gameObjectPath: "World/Item",
    },
    verificationStatus: "missing",
    validation: {
      presentComponentTypes: [],
      missingComponentTypes: ["UnityEngine.Rigidbody"],
      matchedComponents: [],
    },
    occurrences: [
      {
        source: {
          filePath: sourcePath,
          line: 2,
          column: 0,
        },
        condition: { kind: "unconditional" },
        evidence: "$.onCollide(() => {})",
        confidence: "high",
      },
    ],
    ...overrides,
  };
}

function createIssue(overrides: Partial<ValidationIssue>): ValidationIssue {
  return {
    line: 2,
    column: 0,
    severity: "error",
    code: "MISSING_COMPONENT",
    message: "Method 'onCollide' requires UnityEngine.Rigidbody",
    apiCall: "onCollide",
    requiredComponents: ["UnityEngine.Rigidbody"],
    availableComponents: [],
    ...overrides,
  };
}

function createAnalysisResult(
  overrides: Partial<AnalysisResult> = {},
): AnalysisResult {
  return {
    filePath: sourcePath,
    issues: [createIssue({})],
    componentRequests: [
      createRequest({}),
      createRequest({
        id: "request-unknown-component",
        api: "$.getUnityComponent",
        componentTypes: ["CustomComponent"],
        verificationStatus: "unverified",
        verificationReason: "The component argument is not statically known.",
        validation: {
          presentComponentTypes: [],
          missingComponentTypes: [],
          matchedComponents: [],
        },
        occurrences: [
          {
            source: {
              filePath: sourcePath,
              line: 5,
              column: 3,
            },
            condition: { kind: "unconditional" },
            evidence: "$.getUnityComponent(dynamicType)",
            confidence: "low",
          },
        ],
      }),
    ],
    summary: {
      totalIssues: 1,
      errorCount: 1,
      warningCount: 0,
      componentRequestCounts: {
        satisfied: 0,
        missing: 1,
        ambiguous: 0,
        unsupported: 0,
        unverified: 1,
      },
    },
    ...overrides,
  };
}

describe("structured analysis formatters", () => {
  it("serializes the versioned JSON report without dropping analyzer data", () => {
    const result = createAnalysisResult();
    const report = JSON.parse(formatJsonAnalysisReport([result])) as {
      schemaVersion: number;
      results: AnalysisResult[];
    };

    expect(report.schemaVersion).toBe(1);
    expect(report.results).toEqual([result]);
    expect(report.results[0]?.summary.componentRequestCounts.unverified).toBe(1);
  });

  it("generates SARIF findings with source positions and component details", () => {
    const sarif = JSON.parse(
      formatSarifAnalysisReport([createAnalysisResult()], workspaceRoot, workspaceRoot),
    ) as {
      $schema: string;
      version: string;
      runs: Array<{
        tool: { driver: { rules: Array<{ id: string }> } };
        results: Array<{
          ruleId: string;
          level: string;
          locations: Array<{
            physicalLocation: {
              artifactLocation: { uri: string };
              region: { startLine: number; startColumn: number };
            };
          }>;
          properties: { componentRequest?: ComponentRequirementRequest };
        }>;
      }>;
    };
    const run = sarif.runs[0]!;

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toBe(
      `https://json.schemastore.org/sarif-${sarif.version}.json`,
    );
    expect(new URL(sarif.$schema).protocol).toBe("https:");
    expect(run.tool.driver.rules.map((rule) => rule.id)).toEqual([
      "component-requirement-missing",
      "component-requirement-unverified",
    ]);
    expect(run.results).toHaveLength(2);
    expect(run.results[0]).toMatchObject({
      ruleId: "component-requirement-missing",
      level: "error",
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: "packages/ts-analyzer/examples/demo.ts",
            },
            region: { startLine: 2, startColumn: 1 },
          },
        },
      ],
      properties: {
        componentRequest: {
          target: {
            gameObjectPath: "World/Item",
          },
        },
      },
    });
    expect(run.results[1]?.level).toBe("warning");
  });

  it("emits GitHub Actions annotations and escapes annotation contents", () => {
    const result = createAnalysisResult({
      issues: [
        createIssue({
          code: "INVALID_STATE_MUTATION",
          severity: "warning",
          line: 8,
          column: 1,
          apiCall: "$.state",
          message: "Invalid %, value:\ncheck again",
        }),
      ],
    });
    const annotations = formatGitHubActionsAnnotations(
      [result],
      workspaceRoot,
      workspaceRoot,
    ).split("\n");

    expect(annotations).toHaveLength(3);
    expect(annotations[0]).toContain(
      "::error file=packages/ts-analyzer/examples/demo.ts,line=2,col=1,title=CCK missing::",
    );
    expect(annotations[1]).toContain(
      "::warning file=packages/ts-analyzer/examples/demo.ts,line=5,col=4,title=CCK unverified::",
    );
    expect(annotations[2]).toBe(
      "::warning file=packages/ts-analyzer/examples/demo.ts,line=8,col=2,title=CCK INVALID_STATE_MUTATION::Invalid %25, value:%0Acheck again",
    );
  });

  it("emits VS Code problem matcher lines without duplicate component issues", () => {
    const result = createAnalysisResult({
      issues: [
        createIssue({
          code: "INVALID_STATE_MUTATION",
          severity: "warning",
          line: 8,
          column: 1,
          apiCall: "$.state",
          message: "Invalid state:\ncheck again",
        }),
      ],
    });
    const problems = formatVSCodeProblems([result], workspaceRoot).split("\n");

    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain(
      `${path.resolve(workspaceRoot, sourcePath)}(2,1): error SCENEGRAPH_COMPONENT_MISSING:`,
    );
    expect(problems[1]).toContain(
      "(5,4): warning SCENEGRAPH_COMPONENT_UNVERIFIED:",
    );
    expect(problems[2]).toContain(
      "(8,2): warning SCENEGRAPH_INVALID_STATE_MUTATION: Invalid state: check again",
    );
  });
});
