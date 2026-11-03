# SceneGraph TOML スキーマ

## 現在の形式

```toml
project = "UnitySemanticGraph"

[[gameObjects]]
id = "GlobalObjectId_V1-..."
path = "Root/Item"
name = "Item"
parent = "Root"

[[gameObjects.components]]
id = "GlobalObjectId_V1-..."
type = "UnityEngine.Rigidbody"
enabled = true

[gameObjects.components.properties]
Mass = 1.0

[[gameObjects.components]]
id = "GlobalObjectId_V1-..."
type = "UnityEngine.MeshRenderer"
enabled = true

[gameObjects.components.properties]
Renderer_Material_Guids = ["material-guid"]

[[materials]]
guid = "material-guid"
name = "CubeColor"
path = "Assets/CubeColor.mat"
shader = "Standard"
emissionEnabled = true
emissionColor = [0.0, 0.0, 0.0, 1.0]
```

## フィールド

| 場所 | 名前 | 現在の意味 |
|---|---|---|
| root | `project` | 出力元プロジェクトの識別名 |
| gameObject | `id` | Unity `GlobalObjectId` |
| gameObject | `path` | シーン内の階層パス |
| gameObject | `name` | GameObject 名 |
| gameObject | `parent` | 親の階層パス。ルートは空文字 |
| component | `id` | Unity `GlobalObjectId` |
| component | `type` | コンポーネントの完全修飾型名 |
| component | `enabled` | exporter が取得した有効状態。`Behaviour` と `Collider` は Unity の状態、それ以外の `Component` は `true` |
| properties | 任意キー | exporter が出力できるシリアライズ済み値。null と未対応値は出力しない |
| properties | `Renderer_Material_Guids` | Renderer に割り当てられた Material の GUID 配列 |
| properties | `Is_Trigger` | Collider の `isTrigger` 状態。Collider コンポーネントに対して exporter が出力 |
| root | `materials` | ItemMaterialSetList が参照する Material の情報。Exporter が出力する任意の配列 |
| material | `guid` / `name` / `path` / `shader` | Material の識別子と Asset 情報 |
| material | `emissionEnabled` | `_EMISSION` キーワードの状態。暗黙ルール用の観測値 |
| material | `emissionColor` | `_EmissionColor` 値。取得可能な場合のみ出力 |

### プロパティ値

`properties` の値は TOML の文字列、数値、真偽値、またはそれらを含む配列です。Unity の Vector、Rect、Quaternion は数値配列、Bounds は二重配列として保存されます。オブジェクト参照は参照先の名前を文字列で保存し、参照 ID は保存しません。analyzer の `ComponentPropertyValue` は、この入れ子配列を含む値を表します。

exporter は文字列内の引用符、バックスラッシュ、改行を TOML 用にエスケープし、浮動小数点数を `InvariantCulture` で出力します。そのため小数点は常に `.` です。エスケープやロケールに関する試験用 TOML は [SceneGraphParser のテスト](../../packages/ts-analyzer/src/sceneGraph/sceneGraphParser.test.ts) にあります。

### Material の参照

- `Item_Material_Sets` は `"<id>=<material-guid>"` 形式で出力されます。ID は Cluster Creator Kit の Item Material Set List 仕様に従います。
- Renderer の `Renderer_Material_Guids` は、その Renderer に割り当てられた Material GUID の配列です。解析器は対象 ScriptableItem 自身と子孫 GameObject の Renderer だけを確認します。
- `[[materials]]` は ItemMaterialSetList が参照する Material の shader 名と Emission 状態を記録します。`emissionEnabled` は経験則ベースの暗黙ルールを確認するための観測値であり、ClusterScript API の公式要件ではありません。

## 互換性ルール

- 既存キーを削除しない。削除が必要な場合は ADR を作成し、移行手順を記録する。
- 新しいキーは parser が無視しても安全な形で追加する。
- parser は `project` を要求し、存在する GameObject の `id`・`path`・`name`・`parent`、Component の `type`・`enabled`、シリアライズ済みプロパティ値を検証する。不完全なデータを既定値で補って解析成功として扱わない。空の SceneGraph は TOML として解析できるが、ワールドアップロード要件の検証では不適合になる。
- `type` の比較は、完全修飾名では完全一致とする。任意の `getUnityComponent` lookup で短縮型名が指定された場合は、末尾名が一致する SceneGraph 上のすべての完全修飾型名を候補として照合する。
- 数値、真偽値、文字列、配列を混同しない。Unity の値型を配列で表す場合も、その配列構造を保持する。
- TOML のエスケープ、キー名、カルチャ依存の数値表現をテストする。
- 差分更新は既存コンポーネントを失わないことを保証する。保証できない間は、全体出力を推奨する。

## Cluster ワールドのアップロード要件

`export-and-analyze` は生成した全体 SceneGraph に対して、[公式のワールド作成とアップロード要件](https://docs.cluster.mu/creatorkit/world/upload/)を検証する。

- 有効な `ClusterVR.CreatorKit.World.Implements.SpawnPoints.SpawnPoint` が1つ以上あり、`properties.Spawn_Type` が `Entrance` であること。
- `ClusterVR.CreatorKit.World.Implements.DespawnHeights.DespawnHeight` がちょうど1つあり、有効であること。
- `ClusterVR.CreatorKit.Item.Implements.Item` を持つ GameObject の子孫に、別の `Item` を配置しないこと。
- 足場用 Collider の有無は検証しない。

Spawn Point と Despawn Height は、SceneGraph 上の完全修飾型名・`enabled`・シリアライズ済み `Spawn_Type` で判定する。Item の親子制約は完全修飾型名と `parent` パスの祖先関係で判定する。Hierarchy や短縮型名だけから SceneGraph を補完しない。

## 変更時の確認項目

- Unity exporter の出力例を更新したか。
- `SceneGraphParser` の parser test を追加したか。
- `domain/types.ts` の型が実データを表せるか。
- 既存のサンプルスクリプトの解析結果が変わっていないか。
- 全体出力と選択範囲更新の両方を確認したか。
