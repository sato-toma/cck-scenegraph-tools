import { ApiMethod } from "../domain/types";

export const materialMethodRules: ApiMethod[] = [
  {
    name: "material",
    requiredComponents: [
      {
        componentType:
          "ClusterVR.CreatorKit.Item.Implements.ItemMaterialSetList",
        requirement: "required",
      },
      {
        // Material は Item 自身またはその子孫の Renderer に割り当てられている必要がある
        componentType: ["UnityEngine.MeshRenderer", "UnityEngine.SkinnedMeshRenderer"],
        requirement: "required",
      },
    ],
    description:
      "ItemMaterialSetList に登録された Material の MaterialHandle を取得します。Id は ItemMaterialSetList の Id と一致させる必要があります。",
  },
];

export const materialRules = {
  methods: materialMethodRules,
  properties: [],
};
