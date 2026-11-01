import { ApiMethod } from "../domain/types";

export const materialMethodRules: ApiMethod[] = [
  {
    name: "material",
    requiredComponents: [
      {
        componentType:
          "ClusterVR.CreatorKit.Item.Implements.ItemMaterialSetList",
        requirement: "required",
        scope: "target",
      },
      {
        componentType: [
          "UnityEngine.MeshRenderer",
          "UnityEngine.SkinnedMeshRenderer",
          "UnityEngine.SpriteRenderer",
          "UnityEngine.LineRenderer",
          "UnityEngine.TrailRenderer",
          "UnityEngine.ParticleSystemRenderer",
          "UnityEngine.Tilemaps.TilemapRenderer",
        ],
        requirement: "required",
        scope: "target-and-descendants",
      },
    ],
    description:
      "ItemMaterialSetList の ID で MaterialHandle を取得します。対象 Item に ItemMaterialSetList が必要で、登録 Material は Item 自身または子孫 GameObject の Renderer で使用します。",
  },
];

export const materialRules = {
  methods: materialMethodRules,
  properties: [],
};
