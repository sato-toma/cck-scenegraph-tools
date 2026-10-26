import { ApiMethod } from "../domain/types";

export const lifecycleMethodRules: ApiMethod[] = [
  {
    name: "onStart",
    requiredComponents: [],
    requiresTopLevelContext: true,
    description: "ScriptableItem の初期化時に呼ばれるコールバックを登録する。",
  },
  {
    name: "onUpdate",
    requiredComponents: [],
    requiresTopLevelContext: true,
    description: "毎フレーム呼ばれるコールバックを登録する。",
  },
  {
    name: "onPhysicsUpdate",
    requiredComponents: [],
    requiresTopLevelContext: true,
    description: "物理更新時に呼ばれるコールバックを登録する。",
  },
];

export const lifecycleRules = {
  methods: lifecycleMethodRules,
  properties: [],
};
