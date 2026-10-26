# データフローと責務

## 全体像

```text
Unity Scene
  -> SelectiveComponentTomlExporter
  -> SceneGraph.toml
  -> SceneGraphParser

ClusterScript TypeScript
  -> TypeScriptCodeParser
  -> 検出した API / state mutation
  -> ComponentRequirementExtractor
  -> 構造化されたコンポーネント要求
  -> ScriptableItem / Source_Code_Asset による対象 GameObject の解決
  -> ComponentRequirementValidator
  -> 対象 GameObject に対する照合結果

SceneGraph + 構造化された要求 + ClusterScriptDefinitions
  -> ConstraintValidator
  -> ClusterScriptAnalyzer
  -> CLI report / CI 結果
  -> ComponentChangePlan（読み取り専用の修正案）
  -> ユーザー確認・明示承認
  -> 承認済み変更のみを Unity CLI MCP `add_component` で適用
  -> 対象ID・階層の再確認、重複防止、適用結果の記録
  -> Unity batchmode exporterで再出力
  -> 対象Component / enabled / 設定値の再照合、同じClusterScriptの再解析
  -> success / failure / unverified の検証レポート

Unity CLI MCP の読み取り応答
  -> McpSceneAdapter
  -> McpSceneSnapshot（GlobalObjectId・階層・短縮Component名・取得状態）
  -> 将来の Reconciler（未実装）
```

## 責務

### Unity exporter

- GameObject の GlobalObjectId、名前、パス、親パスを出力する。
- Transform 以外のコンポーネントを出力する。
- コンポーネントの型、enabled 状態、解析に必要なシリアライズ済みプロパティを出力する。
- 全体出力と選択範囲の差分更新を提供する。

### TOML parser

- TOML の構文を検証する。
- GameObject、コンポーネント、親子関係を内部型へ変換する。
- ID、パス、型、enabled 状態の検索を提供する。

### TypeScript parser

- 現在は文字列パターンから `$.method()`、プロパティアクセス、`$.state` の直接変更を検出する。
- コメント、別名、複雑な式、改行を含むコードでは誤検出や見逃しがあり得る。
- Compiler API へ移行するまでは、検出できる構文をテストで明示する。
- `ComponentRequirementExtractor` は、既知 API の required 制約と文字列リテラルの `getUnityComponent(...)` lookup を構造化する。`$` から続くreceiver method chainの文字列引数を階層パスとして扱い、動的な引数は `unsupported` とする。任意 lookup の完全修飾型名は完全一致し、短縮型名は SceneGraph 上で末尾名が一致するすべての型と照合する。階層パスは最終的な GameObject が一意な場合だけ解決する。`unityProp` による個々のプロパティ名・値の妥当性は analyzer では検証しない。
- 同一 API・同一型条件の要求は集約し、全ての出現位置・条件・根拠を残す。条件抽出は単純な `if` ブロックに限定し、解釈できない条件は `unknown` とする。
- `ComponentRequirementValidator` は `Source_Code_Asset` とソースファイルを対応付け、対象 GameObject が一意なら `ConstraintValidator` でそのオブジェクトの階層内にある有効な Component と照合する。結果には照合した Component の所有 GameObject ID / path も含める。対象不明・複数候補・未対応引数は、それぞれ `unverified`・`ambiguous`・`unsupported` として返す。曖昧な候補は ID / path を含め、任意の候補を選んだ欠落判定は行わない。
- `AnalysisResult.componentRequests` は要求と照合結果を保持する。条件付き要求は条件式とともに出力し、対象を特定できない場合は不足と断定しない。
- 任意 lookup は required 制約と分けて扱う。診断形式の詳細は[レポート仕様](../analysis-report-formats.md)を参照。
- `ComponentChangePlan` は確認済みの未配置 Component を任意候補に含める。適用には対象・設定値の明示確認と承認が必要。
- `ComponentChangePlan` は確定した `missing` 要求から追加のみの計画を作る。SceneGraph TOML にシーンパスは含まれないため、対象Unityシーンのパスを明示する。計画生成にMCP読み取りは不要。設定値や代替Componentの選択、対象解決が未確定の項目を含む計画は、明示的なユーザー判断なしに承認できない。承認は計画内容に結び付けられ、承認後に変更された計画は適用用データへ変換できない。
- `applyApprovedComponentChangePlan` は承認ダイジェストを検証してからのみ MCP ブリッジを呼ぶ。`applyApprovedComponentChangePlanViaUnityCliMcp` は `.mcp.json` の Unity stdio サーバーに接続し、この適用関数を呼び出す。各追加の直前・直後に GlobalObjectId と階層パスを再確認し、Component が既に存在する場合は追加を省略する。設定は承認計画の値だけを送り、対象不一致や MCP エラーでは後続の変更を停止して監査記録を含むエラーを返す。ユーザー承認 UI は呼び出し側の責務である。
- `applyAndVerifyComponentChangePlanViaUnityCliMcp` は、承認済み計画を適用した後に Unity batchmode exporterを実行し、生成したSceneGraphと対象スクリプトを再解析する。変更結果には GlobalObjectId / path、Component型、承認値とExporter出力値を含める。状態は実行時定数 `COMPONENT_CHANGE_*_STATUSES` とその型で表し、確認できない値は成功にせず `unverified` とする。この結果は構造と静的制約の検証であり、実行時動作を保証しない。
- `McpSceneAdapter` は Unity CLI MCP の `get_scene_hierarchy` / `find_gameobjects` 応答を純粋関数で正規化する。`instanceId` は応答間の結合にだけ使い、GlobalObjectId が得られない対象は診断に記録してスナップショットから除外する。Component の `enabled` は MCP から取得できないため `unsupported` とし、SceneGraph や analyzer の入力に変換しない。

### 要求モデルとバリデータ

- `ComponentRequirementRequest` は「どの API 呼び出しが、どの Component 型を、どのソース位置で要求したか」を表すデータであり、それ自体は SceneGraph との判定結果ではない。
- `ComponentRequirementValidator` は要求を `Source_Code_Asset` に紐づく対象 GameObject に対応付け、照合結果を要求に付与する。
- `ConstraintValidator` は一つの GameObject と Component 制約を比較する低レベルの判定器。対象解決や解析レポート全体の生成は担当しない。
- この経路は現在の SceneGraph TOML を使う。MCP 応答の正規化は実装済みだが、Reconciler・analyzerへの接続・不足判定は未実装であり、既存の解析経路には影響しない。

### Constraint validator

- API 定義の required / optional / forbidden を TOML のコンポーネントと照合する。
- 親 GameObject を含めるかどうかは、現在の analyzer の解決規則に従う。
- 「文字列が一致した」ことと「正しい GameObject に属する」ことを分けて報告できる設計を目指す。

## SceneGraph.toml の構造で守ること

- コンポーネント型は Unity の完全修飾名を基本とする。
- `enabled = false` のコンポーネントは、存在していても使用可能とはみなさない。
- `path` と `parent` の表現は、ID・名前・パスの混在を避け、将来は schema で明示する。
- exporter の出力変更は parser が受け取れることだけでなく、既存 TOML の互換性も確認する。
