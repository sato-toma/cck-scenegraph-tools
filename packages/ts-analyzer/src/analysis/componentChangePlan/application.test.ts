import { describe, expect, it } from "vitest";
import {
  applyApprovedComponentChangePlan,
  approveComponentChangePlan,
  createComponentChangePlan,
  resolveComponentChangeSettings,
  type ComponentChangePlan,
  type UnityComponentApplicationBridge,
} from ".";
import type {
  AnalysisResult,
  ComponentRequirementRequest,
  SceneGraph,
} from "../../domain/types";

const sceneGraph: SceneGraph = {
  project: "TestProject",
  gameObjects: [],
};

function request(
  id: string,
  componentType: string,
  line: number,
): ComponentRequirementRequest {
  return {
    id,
    api: "$.onGrab",
    componentTypes: [componentType],
    componentMatch: "all",
    target: {
      kind: "current-scriptable-item",
      resolution: "resolved",
      gameObjectId: "item-id",
      gameObjectPath: "Root/Item",
    },
    verificationStatus: "missing",
    validation: {
      presentComponentTypes: [],
      missingComponentTypes: [componentType],
      matchedComponents: [],
    },
    occurrences: [
      {
        source: { filePath: "item.ts", line, column: 0 },
        condition: { kind: "unconditional" },
        evidence: "$.onGrab(() => {})",
        confidence: "high",
      },
    ],
  };
}

function analysisResult(
  requests: ComponentRequirementRequest[],
): AnalysisResult {
  return {
    filePath: "item.ts",
    issues: [],
    componentRequests: requests,
    summary: {
      totalIssues: 0,
      errorCount: 0,
      warningCount: 0,
      componentRequestCounts: {
        satisfied: 0,
        missing: requests.length,
        ambiguous: 0,
        unsupported: 0,
        unverified: 0,
      },
    },
  };
}

function makePlan(
  componentTypes: string[] = ["UnityEngine.Rigidbody"],
  settings: Record<string, string | number | boolean | (string | number | boolean)[]> = {},
  approved = true,
): ComponentChangePlan {
  const plan = createComponentChangePlan(
    sceneGraph,
    [
      analysisResult(
        componentTypes.map((type, index) =>
          request(`request-${index}`, type, index + 1),
        ),
      ),
    ],
    "Assets/Main.unity",
    "SceneGraph.toml",
  );
  const resolved = plan.actions.reduce(
    (current, action, index) =>
      resolveComponentChangeSettings(
        current,
        action.id,
        index === 0 ? settings : {},
      ),
    plan,
  );
  return approved
    ? approveComponentChangePlan(resolved, {
        planId: resolved.id,
        confirmed: true,
      })
    : resolved;
}

function makeBridge(options: {
  presentTypes?: string[];
  inspectionResults?: Array<
    Awaited<ReturnType<UnityComponentApplicationBridge["inspectTarget"]>>
  >;
  addError?: Error;
  leaveMissingAfterAdd?: boolean;
} = {}) {
  const presentTypes = new Set(options.presentTypes ?? []);
  const calls: string[] = [];
  let inspectionIndex = 0;
  const bridge: UnityComponentApplicationBridge = {
    async inspectTarget(globalObjectId, componentType) {
      calls.push(`inspect:${globalObjectId}:${componentType}`);
      const result = options.inspectionResults?.[inspectionIndex];
      inspectionIndex += 1;
      return (
        result ?? [
          {
            handle: "instance-1",
            globalObjectId,
            hierarchyPath: "Root/Item",
            componentPresent: presentTypes.has(componentType),
          },
        ]
      );
    },
    async addComponent(target, componentType) {
      calls.push(`add:${target.globalObjectId}:${componentType}`);
      if (options.addError) {
        throw options.addError;
      }
      if (!options.leaveMissingAfterAdd) {
        presentTypes.add(componentType);
      }
    },
    async setComponentProperties(target, componentType, properties) {
      calls.push(
        `settings:${target.globalObjectId}:${componentType}:${JSON.stringify(properties)}`,
      );
    },
  };
  return { bridge, calls };
}

describe("approved component change application", () => {
  it("applies only approved changes and verifies the target and component", async () => {
    const plan = makePlan(
      ["UnityEngine.Rigidbody"],
      { mass: 2, useGravity: false },
    );
    const { bridge, calls } = makeBridge();

    const records = await applyApprovedComponentChangePlan(plan, bridge);

    expect(calls).toEqual([
      "inspect:item-id:UnityEngine.Rigidbody",
      "add:item-id:UnityEngine.Rigidbody",
      'settings:item-id:UnityEngine.Rigidbody:{"mass":2,"useGravity":false}',
      "inspect:item-id:UnityEngine.Rigidbody",
    ]);
    expect(records.map(({ phase, result }) => [phase, result])).toEqual([
      ["before", "observed"],
      ["add-component", "added"],
      ["set-properties", "applied"],
      ["after", "observed"],
      ["after", "verified"],
    ]);
  });

  it("refuses unapproved plans without calling the MCP bridge", async () => {
    const plan = makePlan(["UnityEngine.Rigidbody"], {}, false);
    const { bridge, calls } = makeBridge();

    await expect(applyApprovedComponentChangePlan(plan, bridge)).rejects.toThrow(
      "has not been approved",
    );
    expect(calls).toEqual([]);
  });

  it("does not call property-setting for an explicitly empty settings object", async () => {
    const plan = makePlan();
    const { bridge, calls } = makeBridge();

    await applyApprovedComponentChangePlan(plan, bridge);

    expect(calls).toEqual([
      "inspect:item-id:UnityEngine.Rigidbody",
      "add:item-id:UnityEngine.Rigidbody",
      "inspect:item-id:UnityEngine.Rigidbody",
    ]);
  });

  it("prevents duplicate additions when the component is already present", async () => {
    const plan = makePlan();
    const { bridge, calls } = makeBridge({
      presentTypes: ["UnityEngine.Rigidbody"],
    });

    const records = await applyApprovedComponentChangePlan(plan, bridge);

    expect(calls).toEqual(["inspect:item-id:UnityEngine.Rigidbody"]);
    expect(records[records.length - 1]).toMatchObject({
      phase: "after",
      result: "skipped",
      componentPresent: true,
    });
  });

  it("stops when the target is ambiguous or its identity changes", async () => {
    const plan = makePlan();
    const { bridge, calls } = makeBridge({
      inspectionResults: [
        [
          {
            handle: "instance-2",
            globalObjectId: "other-id",
            hierarchyPath: "Root/Item",
            componentPresent: false,
          },
        ],
      ],
    });

    await expect(applyApprovedComponentChangePlan(plan, bridge)).rejects.toThrow(
      "Target identity changed",
    );
    expect(calls).toEqual(["inspect:item-id:UnityEngine.Rigidbody"]);
  });

  it("stops after MCP failure and includes the failure in the audit records", async () => {
    const plan = makePlan(["UnityEngine.Rigidbody", "UnityEngine.BoxCollider"]);
    const { bridge, calls } = makeBridge({
      addError: new Error("MCP tool rejected the request"),
    });

    let applicationError: unknown;
    try {
      await applyApprovedComponentChangePlan(plan, bridge);
    } catch (error) {
      applicationError = error;
    }

    expect(applicationError).toMatchObject({
      name: "ComponentChangeApplicationError",
      actionId: plan.actions[0]?.id,
      message: expect.stringContaining("remaining changes were not applied"),
      records: [
        { phase: "before", result: "observed" },
        {
          phase: "add-component",
          result: "failed",
          message: "MCP tool rejected the request",
        },
        { phase: "after", result: "observed", componentPresent: false },
      ],
    });
    expect(calls).toEqual([
      "inspect:item-id:UnityEngine.Rigidbody",
      "add:item-id:UnityEngine.Rigidbody",
      "inspect:item-id:UnityEngine.Rigidbody",
    ]);
  });

  it("does not report success when the added component is absent afterward", async () => {
    const plan = makePlan(["UnityEngine.Rigidbody", "UnityEngine.BoxCollider"]);
    const { bridge, calls } = makeBridge({ leaveMissingAfterAdd: true });

    await expect(applyApprovedComponentChangePlan(plan, bridge)).rejects.toThrow(
      "could not be verified",
    );
    expect(calls).toEqual([
      "inspect:item-id:UnityEngine.Rigidbody",
      "add:item-id:UnityEngine.Rigidbody",
      "inspect:item-id:UnityEngine.Rigidbody",
    ]);
  });
});
