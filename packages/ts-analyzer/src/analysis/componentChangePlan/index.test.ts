import { describe, expect, it } from "vitest";
import {
  approveComponentChangePlan,
  createComponentChangePlan,
  excludeComponentChangeReviewItem,
  getApprovedComponentChanges,
  rejectComponentChangePlan,
  resolveComponentChangeSettings,
} from ".";
import { formatComponentChangePlan } from "../../reporting/componentChangePlanFormatter";
import {
  AnalysisResult,
  ComponentRequirementRequest,
  SceneGraph,
} from "../../domain/types";

const sceneGraph: SceneGraph = {
  project: "TestProject",
  gameObjects: [],
};

function request(
  overrides: Partial<ComponentRequirementRequest> = {},
): ComponentRequirementRequest {
  return {
    id: "request-1",
    api: "$.onGrab",
    componentTypes: ["ClusterVR.CreatorKit.Item.Implements.GrabbableItem"],
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
      missingComponentTypes: [
        "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
      ],
      matchedComponents: [],
    },
    occurrences: [
      {
        source: { filePath: "item.ts", line: 12, column: 3 },
        condition: { kind: "unconditional" },
        evidence: "$.onGrab(() => {})",
        confidence: "high",
      },
    ],
    ...overrides,
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
        missing: requests.filter((item) => item.verificationStatus === "missing")
          .length,
        ambiguous: requests.filter(
          (item) => item.verificationStatus === "ambiguous",
        ).length,
        unsupported: requests.filter(
          (item) => item.verificationStatus === "unsupported",
        ).length,
        unverified: requests.filter(
          (item) => item.verificationStatus === "unverified",
        ).length,
      },
    },
  };
}

describe("component change planning", () => {
  it("plans only concrete missing components on a uniquely resolved target", () => {
    const plan = createComponentChangePlan(sceneGraph, [
      analysisResult([
        request(),
        request({
          id: "request-2",
          api: "$.onInteract",
          occurrences: [
            {
              source: { filePath: "item.ts", line: 20, column: 3 },
              condition: { kind: "conditional", expression: "canInteract" },
              evidence: "$.onInteract(() => {})",
              confidence: "high",
            },
          ],
        }),
      ]),
    ], "Assets/Main.unity", "SceneGraph.toml");

    expect(plan.status).toBe("needs-user-input");
    expect(plan.scenePath).toBe("Assets/Main.unity");
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]).toMatchObject({
      target: { gameObjectId: "item-id", gameObjectPath: "Root/Item" },
      componentType: "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
      expectedResult: "satisfied-after-reexport",
      sideEffects: [
        "runtime-effects-not-statically-verified",
        "no-removal-or-replacement",
      ],
      requirementIds: [
        expect.stringMatching(/^request-1-/),
        expect.stringMatching(/^request-2-/),
      ],
      apis: ["$.onGrab", "$.onInteract"],
      settings: { resolution: "needs-user-input", values: {} },
      evidence: [
        { source: { line: 12 } },
        { source: { line: 20 }, condition: { expression: "canInteract" } },
      ],
    });
    const report = formatComponentChangePlan(plan);
    expect(report).toContain("Unity scene: Assets/Main.unity");
    expect(report).toContain("confirm values or explicitly confirm no additional settings");
    expect(report).toContain("No existing component is removed or replaced");
  });

  it("requires settings and explicit disposition of unresolved requirements before approval", () => {
    const plan = createComponentChangePlan(sceneGraph, [
      analysisResult([
        request(),
        request({
          id: "ambiguous-request",
          verificationStatus: "ambiguous",
          target: {
            kind: "current-scriptable-item",
            resolution: "ambiguous",
            candidates: [
              { gameObjectId: "a", gameObjectPath: "A" },
              { gameObjectId: "b", gameObjectPath: "B" },
            ],
          },
        }),
      ]),
    ], "Assets/Main.unity", "SceneGraph.toml");

    expect(plan.status).toBe("needs-user-input");
    expect(plan.reviewItems[0]).toMatchObject({
      requestId: expect.stringMatching(/^ambiguous-request-/),
      verificationStatus: "ambiguous",
      disposition: "needs-user-input",
    });
    expect(() =>
      approveComponentChangePlan(plan, { planId: plan.id, confirmed: true }),
    ).toThrow(
      "Only a complete plan can be approved",
    );

    const withSettings = resolveComponentChangeSettings(
      plan,
      plan.actions[0]!.id,
      {},
    );
    const ready = excludeComponentChangeReviewItem(
      withSettings,
      plan.reviewItems[0]!.requestId,
      "Do not modify this unresolved requirement.",
    );
    expect(ready.status).toBe("ready-for-approval");

    const approved = approveComponentChangePlan(ready, {
      planId: ready.id,
      confirmed: true,
    });
    expect(approved.status).toBe("approved");
    expect(getApprovedComponentChanges(approved).changes).toHaveLength(1);
  });

  it("does not choose between alternative component types automatically", () => {
    const plan = createComponentChangePlan(sceneGraph, [
      analysisResult([
        request({
          componentTypes: ["Component.A", "Component.B"],
          componentMatch: "any",
          validation: {
            presentComponentTypes: [],
            missingComponentTypes: ["Component.A", "Component.B"],
            matchedComponents: [],
          },
        }),
      ]),
    ], "Assets/Main.unity", "SceneGraph.toml");

    expect(plan.status).toBe("needs-user-input");
    expect(plan.actions).toHaveLength(0);
    expect(plan.reviewItems[0]).toMatchObject({
      reason: "alternative-component-not-selected",
      disposition: "needs-user-input",
    });
    expect(() => getApprovedComponentChanges(plan)).toThrow(
      "has not been approved",
    );
  });

  it("keeps review items from separate files independently addressable", () => {
    const firstRequest = request({
      verificationStatus: "unverified",
      target: {
        kind: "current-scriptable-item",
        resolution: "unresolved",
      },
      occurrences: [
        {
          source: { filePath: "first.ts", line: 1, column: 0 },
          condition: { kind: "unconditional" },
          evidence: "$.onGrab",
          confidence: "high",
        },
      ],
    });
    const secondRequest = request({
      verificationStatus: "unverified",
      target: {
        kind: "current-scriptable-item",
        resolution: "unresolved",
      },
      occurrences: [
        {
          source: { filePath: "second.ts", line: 1, column: 0 },
          condition: { kind: "unconditional" },
          evidence: "$.onGrab",
          confidence: "high",
        },
      ],
    });
    const plan = createComponentChangePlan(
      sceneGraph,
      [
        analysisResult([firstRequest]),
        analysisResult([secondRequest]),
      ],
      "Assets/Main.unity",
      "SceneGraph.toml",
    );

    expect(plan.reviewItems).toHaveLength(2);
    expect(plan.reviewItems[0]?.requestId).not.toBe(
      plan.reviewItems[1]?.requestId,
    );

    const partiallyReviewed = excludeComponentChangeReviewItem(
      plan,
      plan.reviewItems[0]!.requestId,
      "Review the other script separately.",
    );
    expect(partiallyReviewed.status).toBe("needs-user-input");
    expect(
      partiallyReviewed.reviewItems.filter(
        (item) => item.disposition === "needs-user-input",
      ),
    ).toHaveLength(1);
  });

  it("rejects a plan and prevents its handoff", () => {
    const plan = createComponentChangePlan(sceneGraph, [
      analysisResult([request()]),
    ], "Assets/Main.unity", "SceneGraph.toml");
    const rejected = rejectComponentChangePlan(plan);

    expect(rejected.status).toBe("rejected");
    expect(() => resolveComponentChangeSettings(rejected, "missing", {})).toThrow(
      "Cannot edit a rejected",
    );
    expect(() => getApprovedComponentChanges(rejected)).toThrow(
      "has not been approved",
    );
  });

  it("rejects a plan modified after user approval", () => {
    const plan = createComponentChangePlan(sceneGraph, [
      analysisResult([request()]),
    ], "Assets/Main.unity", "SceneGraph.toml");
    const completed = resolveComponentChangeSettings(
      plan,
      plan.actions[0]!.id,
      {},
    );
    const approved = approveComponentChangePlan(completed, {
      planId: completed.id,
      confirmed: true,
    });
    const changed = {
      ...approved,
      actions: approved.actions.map((action) => ({
        ...action,
        target: { ...action.target, gameObjectId: "different-object" },
      })),
    };

    expect(() => getApprovedComponentChanges(changed)).toThrow(
      "has been modified",
    );
  });

  it("requires approval to identify this exact plan", () => {
    const plan = createComponentChangePlan(
      sceneGraph,
      [analysisResult([request()])],
      "Assets/Main.unity",
      "SceneGraph.toml",
    );
    const ready = resolveComponentChangeSettings(
      plan,
      plan.actions[0]!.id,
      {},
    );

    expect(() =>
      approveComponentChangePlan(ready, {
        planId: "another-plan",
        confirmed: true,
      }),
    ).toThrow("Explicit confirmation for this plan is required.");
  });

  it("does not create an approvable plan when no concrete change is available", () => {
    const plan = createComponentChangePlan(sceneGraph, [
      analysisResult([
        request({
          verificationStatus: "satisfied",
          validation: {
            presentComponentTypes: [
              "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
            ],
            missingComponentTypes: [],
            matchedComponents: [],
          },
        }),
      ]),
    ], "Assets/Main.unity", "SceneGraph.toml");

    expect(plan.status).toBe("no-changes");
    expect(() =>
      approveComponentChangePlan(plan, { planId: plan.id, confirmed: true }),
    ).toThrow(
      "current status is no-changes",
    );
  });

  it("requires an explicit Unity scene path", () => {
    expect(() =>
      createComponentChangePlan(
        sceneGraph,
        [],
        "  ",
        "SceneGraph.toml",
      ),
    ).toThrow("An explicit Unity scene path is required.");
  });
});
