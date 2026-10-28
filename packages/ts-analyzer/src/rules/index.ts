import { physicsRules } from "./physics";
import { interactionRules } from "./interactions";
import { movementRules } from "./movement";
import { stateRules } from "./state";
import { stateMutationRules } from "./stateMutation";
import { lifecycleRules } from "./lifecycle";
import { visibilityRules } from "./visibility";

export const ruleSets = {
  physics: physicsRules,
  interaction: interactionRules,
  movement: movementRules,
  state: stateRules,
  lifecycle: lifecycleRules,
  visibility: visibilityRules,
};

export const stateMutationRuleSets = stateMutationRules;
