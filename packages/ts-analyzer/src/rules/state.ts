import { ApiMethod } from "../domain/types";

export const stateMethodRules: ApiMethod[] = [
  {
    name: "setStateCompat",
    requiredComponents: [],
    requiresCallbackContext: true,
    description:
      "CompatStateTarget のステートを更新するAPI。状態を変更するため、コールバック内で呼び出す。",
  },
];

export const stateRules = {
  methods: stateMethodRules,
  properties: [],
};
