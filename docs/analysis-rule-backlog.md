# 解析ルール追加候補一覧

ClusterScript API の解析ルールは、Unity 上でコンポーネント構成と実行結果を確認してから、1 項目ずつ追加する。
この一覧では、候補を API 単位に分ける。複数 API を同時に実装しない。

## 進め方

1. 対象 API の Unity サンプルシーンを作成する。
2. 必須コンポーネント、無効化時の挙動、親 GameObject の継承可否を確認する。
3. SceneGraph.toml をエクスポートする。
4. 不足時に期待する analyzer issue と、充足時に issue が出ないことを fixture で固定する。
5. 解析ルール、テスト、必要ならサンプルを 1 項目分だけコミットする。

「要確認」は、TypeScript 定義の説明だけでは analyzer の制約として確定しない項目を示す。

## 現在実装済み

| API | ルール | Unity 確認 |
| --- | --- | --- |
| `setPosition` | `MovableItem` 必須 | 済み |
| `setRotation` | `MovableItem` 必須 | 済み |
| `onGrab` | `GrabbableItem` 必須 | 済み |
| `onCollide` | `Rigidbody` 必須 | 済み |
| `getOverlaps` | `OverlapDetectorShape` 必須 | 済み |
| state の配列メソッド | 状態の直接変更を検出 | コンポーネント制約なし |
| state のネスト代入 | 状態の直接変更を検出 | コンポーネント制約なし |

## 優先候補

### P0: 既存ルールの近接 API

| 状態 | API | Unity で確認すること | 想定する制約 |
| --- | --- | --- | --- |
| [ ] | `onInteract` | 無効化時、親階層の扱い（Unity 未確認） | `UnityEngine.BoxCollider` / `SphereCollider` / `CapsuleCollider` / `MeshCollider` / `WheelCollider` のいずれか1個以上 |
| [ ] | `onUse` | 2026-10-17: MCP で不足・充足を確認。実行時挙動は未検証 | `ClusterVR.CreatorKit.Item.Implements.GrabbableItem`（ClusterScript 定義に必須と明記） |
| [ ] | `onRide` | 乗車可能設定、RidableItem の有無 | `RidableItem`。要確認 |
| [ ] | `getGrabbingPlayer` | Grab 中と非 Grab 中の戻り値 | `GrabbableItem`。要確認 |
| [ ] | `getRidingPlayer` | Ride 中と非 Ride 中の戻り値 | `RidableItem`。要確認 |

### P1: 移動・物理

| 状態 | API | Unity で確認すること | 想定する制約 |
| --- | --- | --- | --- |
| [ ] | `getPosition` | MovableItem なし、親にある場合、戻り値 | `MovableItem`。要確認 |
| [ ] | `getRotation` | MovableItem なし、親にある場合、戻り値 | `MovableItem`。要確認 |
| [ ] | `onPhysicsUpdate` | Rigidbody、MovableItem、FixedUpdate 相当の実行条件 | `MovableItem`。要確認 |
| [ ] | `useGravity` | 読み取り、書き込み、トップレベル外の制限 | `MovableItem`。要確認 |
| [ ] | `velocity` | 読み取り、書き込み、Grab 中の挙動 | `MovableItem`。要確認 |
| [ ] | `angularVelocity` | 読み取り、書き込み、Grab 中の挙動 | `MovableItem`。要確認 |
| [ ] | `addForce` | onPhysicsUpdate 内外、Rigidbody の有無 | `MovableItem`。要確認 |
| [ ] | `addTorque` | onPhysicsUpdate 内外、Rigidbody の有無 | `MovableItem`。要確認 |
| [ ] | `addForceAt` | onPhysicsUpdate 内外、位置指定の扱い | `MovableItem`。要確認 |
| [ ] | `addImpulsiveForce` | 実行可能なタイミング、Rigidbody の有無 | `MovableItem`。要確認 |
| [ ] | `addImpulsiveTorque` | 実行可能なタイミング、Rigidbody の有無 | `MovableItem`。要確認 |
| [ ] | `addImpulsiveForceAt` | 実行可能なタイミング、位置指定の扱い | `MovableItem`。要確認 |

### P1: 近傍検索・生成

| 状態 | API | Unity で確認すること | 想定する制約 |
| --- | --- | --- | --- |
| [ ] | `getItemsNear` | 検知対象 Shape、レイヤー、距離 | 要確認 |
| [ ] | `getPlayersNear` | 検知対象 Collider、レイヤー、距離 | 要確認 |
| [ ] | `raycast` | Collider、PhysicalShape、検知対象レイヤー | 要確認 |
| [ ] | `raycastAll` | Collider、PhysicalShape、結果の扱い | 要確認 |
| [ ] | `createItem` | Template、生成元、生成権限、遅延生成 | 要確認 |
| [ ] | `destroy` | 動的生成アイテムと設置アイテムの差 | 要確認 |

### P2: 通信・入力・課金

| 状態 | API | Unity で確認すること | 想定する制約 |
| --- | --- | --- | --- |
| [ ] | `onReceive` | Item/Player 送信元の設定と受信条件 | 要確認 |
| [ ] | `onTextInput` | Text Input 関連コンポーネントとイベント条件 | 要確認 |
| [ ] | `onSteer` | ステア入力を受ける対象コンポーネント | 要確認 |
| [ ] | `onSteerAdditionalAxis` | 追加軸入力の設定とイベント条件 | 要確認 |
| [ ] | `onRequestPurchaseStatus` | 商品設定、購入要求との関係 | 要確認 |
| [ ] | `onPurchaseUpdated` | 商品設定、購入状態更新条件 | 要確認 |
| [ ] | `subscribePurchase` | 商品 ID の設定と購読条件 | 要確認 |
| [ ] | `unsubscribePurchase` | 商品 ID の設定と購読解除条件 | 要確認 |
| [ ] | `onGetOwnProducts` | 商品所有情報の取得条件 | 要確認 |

### P2: 所有権・外部連携・表示

| 状態 | API | Unity で確認すること | 想定する制約 |
| --- | --- | --- | --- |
| [ ] | `getOwner` | オーナーが存在しない場合と戻り値 | 要確認 |
| [ ] | `requestOwner` | 所有権要求の許可条件 | 要確認 |
| [ ] | `callExternal` | External Call 関連設定と callback 対応 | 要確認 |
| [ ] | `onExternalCallEnd` | 外部呼び出し完了条件 | 要確認 |
| [ ] | `setVisiblePlayers` | 表示対象設定の有効範囲 | 要確認 |
| [ ] | `clearVisiblePlayers` | 表示対象解除の有効範囲 | 要確認 |
| [ ] | `getUnityComponent` | 指定可能な Unity component type と戻り値 | 要確認 |

## 着手しない候補

以下は、コンポーネント制約ではなく API の型・実行時意味の検証が中心になるため、基本的な制約ルールが揃うまで後回しにする。

- `Vector2`、`Vector3`、`Vector4`、`Quaternion`、`Color` などの数学 API
- `PlayerHandle`、`ItemHandle`、`HumanoidAnimation` などハンドル自身のメソッド
- `state` の型検証、シリアライズ可能値の検証
- コメント、文字列、optional chaining、alias、import を含む parser の改善

## 完了条件

候補を完了扱いにするのは、次のすべてを満たした場合だけとする。

- Unity で必須・任意・無効時の挙動を確認した。
- SceneGraph.toml に必要なコンポーネントが出力されることを確認した。
- 不足時に issue が 1 件以上出るテストがある。
- 必須コンポーネントがある場合に issue が出ないテストがある。
- `npm run verify` が成功する。
- 対応する行を `[x]` に更新し、確認した Unity 条件を追記した。
