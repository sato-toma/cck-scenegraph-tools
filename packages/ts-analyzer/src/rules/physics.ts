import { ApiMethod, ApiProperty } from "../domain/types";

export const physicsMethodRules: ApiMethod[] = [
  {
    name: "addForce",
    requiredComponents: [
      {
        componentType: "ClusterVR.CreatorKit.Item.Implements.MovableItem",
        requirement: "required",
      },
    ],
    requiredCallbackContext: "onPhysicsUpdate",
    description:
      "onPhysicsUpdate のコールバック内でアイテムに力を加える。MovableItem は Rigidbody を必要とする。",
  },
];

export const physicsPropertyRules: ApiProperty[] = [];

export const physicsRules = {
  methods: physicsMethodRules,
  properties: physicsPropertyRules,
};
