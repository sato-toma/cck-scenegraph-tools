import { physicsRules } from "./physics";
import { interactionRules } from "./interactions";
import { movementRules } from "./movement";
import { stateRules } from "./state";
import { stateMutationRules } from "./stateMutation";
import { lifecycleRules } from "./lifecycle";
import { materialRules } from "./material";
import { visibilityRules } from "./visibility";

export const ruleSets = {
  physics: physicsRules,
  interaction: interactionRules,
  movement: movementRules,
  state: stateRules,
  lifecycle: lifecycleRules,
  material: materialRules,
  visibility: visibilityRules,
};

export const stateMutationRuleSets = stateMutationRules;
