import { ApiMethod } from "../domain/types";

export const interactionMethodRules: ApiMethod[] = [
  {
    name: "onInteract",
    requiredComponents: [
      {
        // Unity の Collider を継承する具象型のいずれか1つ以上が必要 (抽象型は SceneGraph.toml に出力されない)
        componentType: [
          "UnityEngine.BoxCollider",
          "UnityEngine.SphereCollider",
          "UnityEngine.CapsuleCollider",
          "UnityEngine.MeshCollider",
          "UnityEngine.WheelCollider",
        ],
        requirement: "required",
      },
    ],
    description:
      "掴めないアイテムに「使う」動作をした際に呼ばれるコールバック。アイテムには1つ以上のColliderコンポーネントが必要",
  },
  {
    name: "onGrab",
    requiredComponents: [
      {
        componentType: "ClusterVR.CreatorKit.Item.Implements.GrabbableItem",
        requirement: "required",
      },
    ],
    description: "アイテムを掴む・手放すときに呼ばれるコールバック",
  },
  {
    name: "onCollide",
    requiredComponents: [
      {
        componentType: "UnityEngine.Rigidbody",
        requirement: "required",
      },
    ],
    description: `アイテムが別の物体と衝突したときのコールバック

注意:
- IsKinematic が設定されている Rigidbody は、Rigidbody のないコライダーや IsKinematic が設定されていない Rigidbody との Collision 判定を行いません。
- 掴まれている状態のアイテムはその Rigidbody が IsKinematic に変更されるため、上述のコライダーとの Collision 判定が行われません。
- それらのアイテムで衝突判定が必要な場合は、どちらかに IsTrigger なコライダーを設定して Trigger イベントを検知するか、設置されているコライダーに IsKinematic がオフで Constraints を全てオンにした Rigidbody を設定してください。

参考: https://docs.cluster.mu/creatorkit/trigger-components/on-collide-item-trigger/`,
  },
  {
    name: "getOverlaps",
    requiredComponents: [
      {
        componentType:
          "ClusterVR.CreatorKit.Item.Implements.OverlapDetectorShape",
        requirement: "required",
      },
    ],
    description: `OverlapDetectorShape に重なっているアイテムやプレイヤーを取得します。

注意:
- このコンポーネントが付与された Collider 自身は、別の Overlap Detector Shape によって検知されません。
- 検知対象となるアイテムには Physical Shape または Overlap Source Shape が必要です。
- Collider は物理的な衝突判定を行わなくなります（物理的な当たり判定とは別の用途です）。

参考: https://docs.cluster.mu/creatorkit/world-components/shape-components/`,
  },
];

export const interactionRules = {
  methods: interactionMethodRules,
  properties: [],
};
