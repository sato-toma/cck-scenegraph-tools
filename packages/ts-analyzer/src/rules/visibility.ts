import { ApiMethod } from "../domain/types";

export const visibilityMethodRules: ApiMethod[] = [
  {
    name: "setVisiblePlayers",
    requiredComponents: [],
    parameterTypes: ["PlayerHandle[]"],
    returnType: "void",
    description:
      "アイテムを閲覧できるプレイヤーを設定する。null と64件を超える配列リテラルを警告する。",
  },
  {
    name: "clearVisiblePlayers",
    requiredComponents: [],
    parameterTypes: [],
    returnType: "void",
    description: "setVisiblePlayers による閲覧対象制限を解除し、全員に表示する。",
  },
];

export const visibilityRules = {
  methods: visibilityMethodRules,
  properties: [],
};
