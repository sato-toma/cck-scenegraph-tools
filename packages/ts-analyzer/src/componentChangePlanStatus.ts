import {
  ComponentChangeAction,
  ComponentChangePlanStatus,
  ComponentChangeReviewItem,
} from "./componentChangePlan";

export function hasUnresolvedComponentChangeInput(
  actions: ComponentChangeAction[],
  reviewItems: ComponentChangeReviewItem[],
): boolean {
  return (
    reviewItems.some((item) => item.disposition !== "excluded") ||
    actions.some((action) => action.settings.resolution !== "resolved")
  );
}

export function getComponentChangePlanStatus(
  actions: ComponentChangeAction[],
  reviewItems: ComponentChangeReviewItem[],
): ComponentChangePlanStatus {
  if (hasUnresolvedComponentChangeInput(actions, reviewItems)) {
    return "needs-user-input";
  }

  return actions.length === 0 ? "no-changes" : "ready-for-approval";
}
