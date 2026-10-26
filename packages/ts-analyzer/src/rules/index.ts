import { physicsRules } from "./physics";
import { interactionRules } from "./interactions";
import { movementRules } from "./movement";
import { stateRules } from "./state";
import { stateMutationRules } from "./stateMutation";

export const ruleSets = {
  physics: physicsRules,
  interaction: interactionRules,
  movement: movementRules,
  state: stateRules,
};

export const stateMutationRuleSets = stateMutationRules;
