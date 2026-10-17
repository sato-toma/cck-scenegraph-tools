import { createHash, randomUUID } from "crypto";
import {
  AnalysisResult,
  ComponentProperty,
  ComponentRequirementOccurrence,
  ComponentRequirementRequest,
  ComponentRequirementVerificationStatus,
  SceneGraph,
} from "../../domain/types";
import { getComponentChangePlanStatus } from "./status";

export type ComponentChangePlanStatus =
  | "needs-user-input"
  | "ready-for-approval"
  | "approved"
  | "rejected"
  | "no-changes";

export type ComponentChangeReviewReason =
  | "requirement-not-verified"
  | "target-not-resolved"
  | "alternative-component-not-selected"
  | "missing-component-types-not-reported";

export interface ComponentChangeAction {
  id: string;
  target: {
    gameObjectId: string;
    gameObjectPath: string;
  };
  componentType: string;
  expectedResult: "satisfied-after-reexport";
  sideEffects: Array<
    "runtime-effects-not-statically-verified" | "no-removal-or-replacement"
  >;
  requirementIds: string[];
  apis: string[];
  evidence: ComponentRequirementOccurrence[];
  settings: {
    resolution: "needs-user-input" | "resolved";
    values: ComponentProperty;
  };
}

export interface ComponentChangeReviewItem {
  requestId: string;
  api: string;
  verificationStatus: ComponentRequirementVerificationStatus;
  reason: ComponentChangeReviewReason;
  explanation: string;
  componentTypes: string[];
  target: ComponentRequirementRequest["target"];
  evidence: ComponentRequirementOccurrence[];
  disposition: "needs-user-input" | "excluded";
  exclusionReason?: string;
}

export interface ComponentChangePlan {
  version: 1;
  id: string;
  project: string;
  scenePath: string;
  sceneGraphPath: string;
  status: ComponentChangePlanStatus;
  actions: ComponentChangeAction[];
  reviewItems: ComponentChangeReviewItem[];
  approval?: {
    planDigest: string;
    approvedAt: string;
  };
}

export interface ApprovedComponentChangePlan {
  planId: string;
  project: string;
  scenePath: string;
  sceneGraphPath: string;
  changes: Array<{
    target: ComponentChangeAction["target"];
    componentType: string;
    settings: ComponentProperty;
    requirementIds: string[];
    apis: string[];
    evidence: ComponentRequirementOccurrence[];
  }>;
}

export interface ComponentChangePlanApprovalConfirmation {
  planId: string;
  confirmed: true;
}

const STATUS_EXPLANATIONS: Record<
  ComponentRequirementVerificationStatus,
  string
> = {
  satisfied: "The required component is already present and enabled.",
  missing: "A required component is missing from the resolved target.",
  ambiguous: "The target or component requirement is ambiguous.",
  unsupported: "The requirement cannot be safely interpreted.",
  unverified: "The requirement has not been verified against the scene.",
};

function createActionId(gameObjectId: string, componentType: string): string {
  return createHash("sha256")
    .update(`${gameObjectId}\0${componentType}`)
    .digest("hex")
    .slice(0, 16);
}

function createPlanRequestId(request: ComponentRequirementRequest): string {
  const sourceKey = request.occurrences
    .map(
      ({ source }) =>
        `${source.filePath}:${source.line}:${source.column}`,
    )
    .sort()
    .join("\0");
  return `${request.id}-${createHash("sha256")
    .update(`${request.id}\0${sourceKey}`)
    .digest("hex")
    .slice(0, 8)}`;
}

function createReviewItem(
  request: ComponentRequirementRequest,
  reason: ComponentChangeReviewReason,
  explanation: string,
): ComponentChangeReviewItem {
  return {
    requestId: createPlanRequestId(request),
    api: request.api,
    verificationStatus: request.verificationStatus,
    reason,
    explanation: request.verificationReason ?? explanation,
    componentTypes: [...request.componentTypes],
    target: { ...request.target },
    evidence: [...request.occurrences],
    disposition: "needs-user-input",
  };
}

function getUnresolvedRequests(
  request: ComponentRequirementRequest,
): ComponentChangeReviewItem[] {
  if (request.verificationStatus === "satisfied") {
    return [];
  }

  if (request.verificationStatus !== "missing") {
    return [
      createReviewItem(
        request,
        "requirement-not-verified",
        STATUS_EXPLANATIONS[request.verificationStatus],
      ),
    ];
  }

  if (request.target.resolution !== "resolved") {
    return [
      createReviewItem(
        request,
        "target-not-resolved",
        "A missing component cannot be planned until its target GameObject is uniquely resolved.",
      ),
    ];
  }

  if (request.componentMatch === "any") {
    return [
      createReviewItem(
        request,
        "alternative-component-not-selected",
        "The requirement accepts alternatives; a specific component type must be selected by the user.",
      ),
    ];
  }

  if (
    request.componentMatch !== "all" ||
    request.validation.missingComponentTypes.length === 0
  ) {
    return [
      createReviewItem(
        request,
        "missing-component-types-not-reported",
        "The analyzer did not report a concrete missing component type.",
      ),
    ];
  }

  return [];
}

export function createComponentChangePlan(
  sceneGraph: SceneGraph,
  results: AnalysisResult[],
  scenePath: string,
  sceneGraphPath: string,
): ComponentChangePlan {
  if (scenePath.trim().length === 0) {
    throw new Error("An explicit Unity scene path is required.");
  }
  if (sceneGraphPath.trim().length === 0) {
    throw new Error("A SceneGraph input path is required.");
  }

  const actionsByKey = new Map<string, ComponentChangeAction>();
  const reviewItems: ComponentChangeReviewItem[] = [];

  for (const result of results) {
    for (const request of result.componentRequests) {
      const planRequestId = createPlanRequestId(request);
      const unresolved = getUnresolvedRequests(request);
      if (unresolved.length > 0) {
        reviewItems.push(...unresolved);
        continue;
      }

      const target = request.target;
      if (
        target.resolution !== "resolved" ||
        !target.gameObjectId ||
        !target.gameObjectPath
      ) {
        reviewItems.push(
          createReviewItem(
            request,
            "target-not-resolved",
            "The target GameObject does not have a stable ID and path.",
          ),
        );
        continue;
      }

      for (const componentType of request.validation.missingComponentTypes) {
        const key = `${target.gameObjectId}\0${componentType}`;
        const action = actionsByKey.get(key);
        if (action) {
          if (!action.requirementIds.includes(planRequestId)) {
            action.requirementIds.push(planRequestId);
          }
          if (!action.apis.includes(request.api)) {
            action.apis.push(request.api);
          }
          action.evidence.push(...request.occurrences);
          continue;
        }

        actionsByKey.set(key, {
          id: createActionId(target.gameObjectId, componentType),
          target: {
            gameObjectId: target.gameObjectId,
            gameObjectPath: target.gameObjectPath,
          },
          componentType,
          expectedResult: "satisfied-after-reexport",
          sideEffects: [
            "runtime-effects-not-statically-verified",
            "no-removal-or-replacement",
          ],
          requirementIds: [planRequestId],
          apis: [request.api],
          evidence: [...request.occurrences],
          settings: {
            resolution: "needs-user-input",
            values: {},
          },
        });
      }
    }
  }

  const actions = [...actionsByKey.values()];
  return {
    version: 1,
    id: randomUUID(),
    project: sceneGraph.project,
    scenePath: scenePath.trim(),
    sceneGraphPath: sceneGraphPath.trim(),
    status: getComponentChangePlanStatus(actions, reviewItems),
    actions,
    reviewItems,
  };
}

export {
  approveComponentChangePlan,
  excludeComponentChangeReviewItem,
  getApprovedComponentChanges,
  rejectComponentChangePlan,
  resolveComponentChangeSettings,
} from "./approval";
export {
  applyApprovedComponentChangePlan,
  ComponentChangeApplicationError,
} from "./application";
export type {
  ComponentChangeApplicationRecord,
  UnityComponentApplicationBridge,
  UnityComponentApplicationTarget,
} from "./application";
