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

SceneGraph + 検出結果 + ClusterScriptDefinitions
  -> ConstraintValidator
  -> ClusterScriptAnalyzer
  -> CLI report / CI 結果
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

### Constraint validator

- API 定義の required / optional / forbidden を TOML のコンポーネントと照合する。
- 親 GameObject を含めるかどうかは、現在の analyzer の解決規則に従う。
- 「文字列が一致した」ことと「正しい GameObject に属する」ことを分けて報告できる設計を目指す。

## SceneGraph.toml の構造で守ること

- コンポーネント型は Unity の完全修飾名を基本とする。
- `enabled = false` のコンポーネントは、存在していても使用可能とはみなさない。
- `path` と `parent` の表現は、ID・名前・パスの混在を避け、将来は schema で明示する。
- exporter の出力変更は parser が受け取れることだけでなく、既存 TOML の互換性も確認する。
