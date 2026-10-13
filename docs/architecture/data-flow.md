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
- `ComponentRequirementExtractor` は、既知 API の required 制約と文字列リテラルの `$.getUnityComponent(...)` を構造化する。動的な引数は `unsupported` とする。
- 同一 API・同一型条件の要求は集約し、全ての出現位置・条件・根拠を残す。条件抽出は単純な `if` ブロックに限定し、解釈できない条件は `unknown` とする。
- `ComponentRequirementValidator` は `Source_Code_Asset` とソースファイルを対応付け、対象 GameObject が一意なら `ConstraintValidator` でそのオブジェクトの階層内にある有効な Component と照合する。結果には照合した Component の所有 GameObject ID / path も含める。対象不明・複数候補・未対応引数は、それぞれ `unverified`・`ambiguous`・`unsupported` として返す。曖昧な候補は ID / path を含め、任意の候補を選んだ欠落判定は行わない。
- 照合結果は `AnalysisResult.componentRequests` と `summary.componentRequestCounts`、および `analyze` / `report` の出力で確認できる。条件付き要求は、実行された場合に必要な Component として照合し、各出現位置の条件式をレポートする。対象が一意に解決できない場合は `MISSING_COMPONENT` を出さず、要求状態を `ambiguous` / `unverified` として報告する。`export-and-analyze --fail-on-issues` は analyzer issue と確定した `missing` で失敗し、`--fail-on-unverified` は `ambiguous` / `unsupported` / `unverified` で失敗する。すべての要求を確認済みにする CI では両方を指定する。
- `McpSceneAdapter` は Unity CLI MCP の `get_scene_hierarchy` / `find_gameobjects` 応答を純粋関数で正規化する。`instanceId` は応答間の結合にだけ使い、GlobalObjectId が得られない対象は診断に記録してスナップショットから除外する。Component の `enabled` は MCP から取得できないため `unsupported` とし、SceneGraph や analyzer の入力に変換しない。

### 要求モデルとバリデータ

- `ComponentRequirementRequest` は「どの API 呼び出しが、どの Component 型を、どのソース位置で要求したか」を表すデータであり、それ自体は SceneGraph との判定結果ではない。
- `ComponentRequirementValidator` は要求を `Source_Code_Asset` に紐づく対象 GameObject に対応付け、照合結果を要求に付与する。
- `ConstraintValidator` は一つの GameObject と Component 制約を比較する低レベルの判定器。対象解決や解析レポート全体の生成は担当しない。
- `$.getUnityComponent("...")` は Component の参照であり、必須条件とは限らないため、型を抽出しても既定では `unverified` とする。
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
