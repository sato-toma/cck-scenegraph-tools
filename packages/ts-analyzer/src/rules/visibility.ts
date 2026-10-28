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
];

export const visibilityRules = {
  methods: visibilityMethodRules,
  properties: [],
};
