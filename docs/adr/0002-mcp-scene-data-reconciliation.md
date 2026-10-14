# ADR 0002: MCP のシーン情報は SceneGraph へ変換せず、照合に使う

- 状態: Proposed
- 日付: 2026-10-12
- 関連: [#32](https://github.com/sato-toma/cck-scenegraph-tools/issues/32)、[Unity CLI MCP 調査](../unity-cli-mcp.md)、[ADR 0001](0001-cross-package-contract.md)

## 背景

Unity CLI MCP から取得できる情報は、SceneGraph TOML の一部にとどまる（[対応表](../unity-cli-mcp.md)）。

- 取得できる: `GlobalObjectId`、階層パス、名前、親子関係、Component の短縮型名
- 取得できない: Component の完全修飾型名、`enabled`、`project`
- 変換が必要: パス（先頭 `/`）、プロパティのキー名と型表現

`SceneGraphParser` は `type`（完全修飾型名）と `enabled` を前提に動く。`enabled` が欠けると `enabled = true` として扱うため、MCP から作った TOML を渡すと、無効な Component を有効と誤判定する。

## 決定

MCP のデータから `SceneGraph.toml` / `SceneGraph` を生成しない。既存 exporter が出力した `SceneGraph` を正とし、MCP のスナップショットとの**照合（reconciliation）**だけを行う。

- 変換の出力は `SceneGraph` ではなく、照合結果（`McpReconciliationReport`）とする。
- `SceneGraph`、`domain/types.ts` の `Component`、`SceneGraphParser` の入力契約は変更しない。
- MCP から得た値で、TOML の値を上書き・補完しない。

### 却下した案

| 案 | 理由 |
|---|---|
| MCP から `SceneGraph` を直接生成する | `type` を短縮名から推測するか、`enabled` を既定値で埋めることになる。ADR 0001 の共有仕様と、「推測で補わない」方針に反する。 |
| `enabled` を `unknown` を許す型にして部分的な `SceneGraph` を作る | 全ての利用箇所（`ConstraintValidator` など）の判定仕様が変わり、既存キーの意味を変える。必要性が確認できてから別 ADR で扱う。 |
| TOML と MCP を自動マージして TOML を更新する | 差分更新が既存 Component を失わない保証がない（[スキーマ](../schema/scene-graph-toml.md)）。 |

## 設計

### データの流れ

```text
MCP ツール応答 -> アダプタ（正規化） -> McpSceneSnapshot ─┐
                                                          ├-> Reconciler -> McpReconciliationReport
exporter の SceneGraph.toml -> SceneGraphParser -> SceneGraph ┘
```

アダプタ（MCP 応答の取得と正規化）と Reconciler（純粋関数）を分ける。Reconciler は Unity にも MCP にも依存せず、fixture だけでテストできる。

### 正規化後の入力

```ts
interface McpSceneSnapshot {
  sceneName: string;
  scenePath: string;
  isActive: boolean;
  isDirty: boolean;
  gameObjects: McpGameObject[];
}

interface McpGameObject {
  globalId: string;          // find_gameobjects.globalId
  hierarchyPath: string;     // get_scene_hierarchy.hierarchyPath（先頭 "/" を保持）
  name: string;
  activeSelf: boolean;
  components: McpComponent[];
}

interface McpComponent {
  shortTypeName: string;     // "Item"、"Rigidbody" など
  enabled: { status: "unsupported"; reason: string };
}
```

アダプタは `McpSceneSnapshot` を作る段階で、取得できなかった値を `undefined` のままにする。既定値で埋めない。

実機応答では、`get_scene_hierarchy` の各 GameObject に一時的な `instanceId` が含まれ、`find_gameobjects` は同じ `instanceId` と安定した `globalId` を返す。アダプタはこの2つの応答を `instanceId` で結び、さらに `hierarchyPath` が一致することを確認してから `globalId` を割り当てる。`instanceId` はツール応答間の一時的な結合にだけ使い、スナップショットの識別子には保存しない。対象が対応しない場合やパスが変わっていた場合は推測で結合せず、診断に記録する。

現行の読み取りツールは Component の短縮型名と GameObject の `activeSelf` を返すが、Component の `enabled` は返さない。正規化後も `enabled` を `unsupported` として保持し、`true` / `false` を推定しない。Component の GlobalObjectId は `get_component_properties` で個別に取得できるが、階層応答には Component の識別子がないため、現在のスナップショットには割り当てない。

### 変換規則

| 項目 | 規則 |
|---|---|
| GameObject の対応付け | `globalId` と SceneGraph の `gameObject.id` の完全一致のみ。パスと名前では対応付けない。 |
| `path` | MCP の `hierarchyPath` から先頭の `/` を 1 つだけ除いて比較する。 |
| `parent` | 比較しない。SceneGraph の `parent` は階層パスで、MCP は入れ子構造から派生するため、`path` の一致で代用する。 |
| `name` | 完全一致で比較する。 |
| Component 型 | SceneGraph の `type` を最後の `.` 以降で短縮名に変換して、MCP の `shortTypeName` と比較する。完全修飾名の一致とは主張しない。 |
| Component の対応付け | `component.globalId` がある場合はそれで対応付ける。ない場合は、短縮名ごとの個数だけを比較し、個々の Component は対応付けない。 |
| `enabled`、`properties`、`project` | 比較しない。 |

### 照合結果

```ts
type GameObjectStatus =
  | "matched"          // ID・パス・名前・Component の短縮名が一致
  | "path-mismatch"    // ID は一致したがパスまたは名前が異なる
  | "component-mismatch" // 短縮名の個数が異なる
  | "missing-in-mcp"   // TOML にあり、MCP にない
  | "missing-in-toml"; // MCP にあり、TOML にない

interface McpReconciliationReport {
  entries: Array<{
    gameObjectId: string;
    status: GameObjectStatus;
    details?: string[];
  }>;
  ambiguous: string[]; // 同じパスが複数の GameObject に一致した MCP 側のパス
  summary: Record<GameObjectStatus, number>;
}
```

`missing-in-toml` と `component-mismatch` は、TOML が古い可能性を示す。ただし、`SceneGraph.toml` が「関連する GameObject だけ」を出力する仕様（Component のない GameObject を省く）と衝突するため、`missing-in-toml` は Transform 以外の Component を持つ MCP 側 GameObject に限る。

### エラーと未取得の扱い

- `globalId` が取得できない MCP 側の GameObject は、`entries` に含めず、アダプタが警告として別に返す。
- 同じパスが複数の MCP GameObject にある場合は `ambiguous` に入れ、ID で一致したものだけを照合する。
- MCP 側のツールが使えない、または Editor が起動していない場合は、照合を実行しない。既存の静的解析は、照合なしで従来どおり動く。
- 照合結果で analyzer の `issues` や終了コードを変更しない。

### 変更しないもの

- `SceneGraph.toml` のキー、`domain/types.ts` の `Component` / `GameObject`、`SceneGraphParser` の公開 API
- analyzer の終了コード、CLI のレポート形式
- MCP の変更系ツールの呼び出し（照合は読み取りツールのみを使う）

## 実装の順序

1. `McpSceneSnapshot` と `McpReconciliationReport` の型、Reconciler の純粋関数、fixture と Vitest テストを追加する。
   - 正常一致、先頭 `/` の正規化、同名・同パスの曖昧、短縮名の個数差、`globalId` なし、Component なしの GameObject を含める。
   - 同じ fixture を `SceneGraphParser` で読み、既存サンプル（`onGrab`）の結果が変わらないことも確認する。
2. 実機の MCP 応答から fixture を採取し、アダプタ（応答の正規化）を追加する。
3. CLI へ照合コマンドを追加するかは、手順 1・2 の結果を見て別途決める。追加する場合は終了コードを文書化する。

手順 2 の読み取り応答 fixture と正規化アダプタは `packages/ts-analyzer/src/fixtures/mcp-on-grab-scene.json` および `McpSceneAdapter` に実装した。現段階では Unity CLI MCP のツール呼び出しは Agent Host が担い、アダプタは読み取りツールの応答を入力として受け取る。Component の `enabled` が取得できないこと、および MCP 取得と SceneGraph 照合をつなぐ CLI は未完了である。

## 未確認の事項

- `get_scene_hierarchy` の `components` に `globalId` が含まれるか。含まれない場合、Component 単位の対応付けは `get_component_properties` を Component ごとに呼ぶ必要があり、大規模シーンでは呼び出し数が増える。
- パスに `/` を含む GameObject 名の MCP 側表現。
- Prefab インスタンス内の Component と `GlobalObjectId` の関係。
- 短縮名が衝突する型（異なる名前空間の同名型）の頻度。衝突した場合は `component.globalId` が必要になる。

## 影響

- 既存の parser と analyzer は変更されない。
- MCP から得られる価値は、TOML が現在のシーンと一致しているかの確認に限られ、`type` や `enabled` の補完には使えない。`enabled` を MCP 経由で扱う必要が出た場合は、exporter 側の拡張（Editor 拡張）か別 ADR で扱う。
