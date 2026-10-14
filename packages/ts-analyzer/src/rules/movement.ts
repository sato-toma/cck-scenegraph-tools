import { ApiMethod } from "../domain/types";

export const movementMethodRules: ApiMethod[] = [
  {
    name: "setPosition",
    requiredComponents: [
      {
        componentType: "ClusterVR.CreatorKit.Item.Implements.MovableItem",
        requirement: "required",
      },
    ],
    parameterTypes: ["Vector3"],
    returnType: "void",
    description: "アイテムの位置を設定",
  },
  {
    name: "setRotation",
    requiredComponents: [
      {
        componentType: "ClusterVR.CreatorKit.Item.Implements.MovableItem",
        requirement: "required",
      },
    ],
    parameterTypes: ["Quaternion"],
    returnType: "void",
    description: "アイテムの回転を設定",
  },
];

export const movementRules = {
  methods: movementMethodRules,
  properties: [],
};
