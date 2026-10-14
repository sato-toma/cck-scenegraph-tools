import { createHash } from "crypto";
import {
  ApprovedComponentChangePlan,
  ComponentChangePlan,
  ComponentChangePlanApprovalConfirmation,
} from "./componentChangePlan";
import { ComponentProperty } from "./types";
import {
  getComponentChangePlanStatus,
  hasUnresolvedComponentChangeInput,
} from "./componentChangePlanStatus";

function planDigest(plan: ComponentChangePlan): string {
  const { status: _status, approval: _approval, ...content } = plan;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

function assertEditablePlan(plan: ComponentChangePlan): void {
  if (
    plan.status === "approved" ||
    plan.status === "rejected" ||
    plan.status === "no-changes"
  ) {
    throw new Error(`Cannot edit a ${plan.status} component change plan.`);
  }
}

function updatePlan(
  plan: ComponentChangePlan,
  actions: ComponentChangePlan["actions"],
  reviewItems: ComponentChangePlan["reviewItems"],
): ComponentChangePlan {
  const updated: ComponentChangePlan = {
    ...plan,
    actions,
    reviewItems,
    status: getComponentChangePlanStatus(actions, reviewItems),
  };
  delete updated.approval;
  return updated;
}

export function resolveComponentChangeSettings(
  plan: ComponentChangePlan,
  actionId: string,
  values: ComponentProperty,
): ComponentChangePlan {
  assertEditablePlan(plan);
  const actionIndex = plan.actions.findIndex((action) => action.id === actionId);
  if (actionIndex < 0) {
    throw new Error(`Component change action not found: ${actionId}`);
  }

  const actions = plan.actions.map((action, index) =>
    index === actionIndex
      ? {
          ...action,
          settings: {
            resolution: "resolved" as const,
            values: { ...values },
          },
        }
      : action,
  );
  return updatePlan(plan, actions, plan.reviewItems);
}

export function excludeComponentChangeReviewItem(
  plan: ComponentChangePlan,
  requestId: string,
  reason: string,
): ComponentChangePlan {
  assertEditablePlan(plan);
  if (reason.trim().length === 0) {
    throw new Error("An exclusion reason is required.");
  }

  let found = false;
  const reviewItems = plan.reviewItems.map((item) => {
    if (item.requestId !== requestId) {
      return item;
    }
    found = true;
    return {
      ...item,
      disposition: "excluded" as const,
      exclusionReason: reason.trim(),
    };
  });

  if (!found) {
    throw new Error(`Component change review item not found: ${requestId}`);
  }

  return updatePlan(plan, plan.actions, reviewItems);
}

export function approveComponentChangePlan(
  plan: ComponentChangePlan,
  confirmation: ComponentChangePlanApprovalConfirmation,
  approvedAt: string = new Date().toISOString(),
): ComponentChangePlan {
  if (confirmation.planId !== plan.id || confirmation.confirmed !== true) {
    throw new Error("Explicit confirmation for this plan is required.");
  }
  if (
    plan.status !== "ready-for-approval" ||
    plan.actions.length === 0 ||
    hasUnresolvedComponentChangeInput(plan.actions, plan.reviewItems)
  ) {
    throw new Error(
      `Only a complete plan can be approved; current status is ${plan.status}.`,
    );
  }

  const approved: ComponentChangePlan = {
    ...plan,
    status: "approved",
    approval: {
      planDigest: planDigest(plan),
      approvedAt,
    },
  };
  return approved;
}

export function rejectComponentChangePlan(
  plan: ComponentChangePlan,
): ComponentChangePlan {
  if (plan.status !== "needs-user-input" && plan.status !== "ready-for-approval") {
    throw new Error(`Cannot reject a ${plan.status} component change plan.`);
  }
  return { ...plan, status: "rejected" };
}

export function getApprovedComponentChanges(
  plan: ComponentChangePlan,
): ApprovedComponentChangePlan {
  if (plan.status !== "approved" || !plan.approval) {
    throw new Error("The component change plan has not been approved.");
  }
  if (planDigest(plan) !== plan.approval.planDigest) {
    throw new Error("The approved component change plan has been modified.");
  }
  if (hasUnresolvedComponentChangeInput(plan.actions, plan.reviewItems)) {
    throw new Error(
      "The component change plan contains unresolved user input.",
    );
  }

  return {
    planId: plan.id,
    project: plan.project,
    scenePath: plan.scenePath,
    sceneGraphPath: plan.sceneGraphPath,
    changes: plan.actions.map((action) => ({
      target: { ...action.target },
      componentType: action.componentType,
      settings: { ...action.settings.values },
      requirementIds: [...action.requirementIds],
      apis: [...action.apis],
      evidence: [...action.evidence],
    })),
  };
}
