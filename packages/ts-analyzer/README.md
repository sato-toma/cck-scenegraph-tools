# TypeScript Analyzer

ClusterScript の TypeScript を静的解析し、Unity シーンの設定漏れや対応していない使い方を確認するツールです。Unity のカスタム Exporter が出力した `SceneGraph.toml` を読み込み、API が要求する Component をスクリプトの対象 GameObject と照合します。

## セットアップ

```bash
npm ci
npm run build
```

最初の解析結果を確認する手順と、自分の Unity プロジェクトへの導入方法は、リポジトリの[クイックスタート](../../docs/quickstart.md)を参照してください。

## CLI

ビルド後、次のコマンドで SceneGraph とスクリプトを解析できます。

```bash
node dist/cli.js analyze <SceneGraph.toml> <script.ts>
node dist/cli.js plan <SceneGraph.toml> <Unity-scene-path> [script.ts]
```

主なコマンド:

```text
analyze       設定漏れや解析上の問題を表示
report        要求 Component と照合根拠を含むレポートを表示
coverage      ClusterScript API の利用状況を表示
recommend     推奨 Component を表示
plan          変更前の Component 修正計画を表示
scene-graph   SceneGraph の構造を表示
list-apis     対応 API を表示
```

Unity Exporter の実行から解析までをまとめて行う場合は、リポジトリルートの [export-and-analyze スクリプト](../../scripts/export-and-analyze.ps1) を利用してください。

## 修正計画と承認

`plan` はシーンを変更せず、利用者が指定した Unity シーンパス、確定した不足 Component の追加候補、対象 GameObject、根拠、設定の未確定状態を表示します。SceneGraph TOML にシーンパスは含まれないため、パスは明示指定が必要です。計画の生成に Unity MCP の読み取りは必要ありません。曖昧・未検証の要求や複数候補のうち一つを選ぶ必要がある要求は、自動で変更候補にしません。

ライブラリからは `createComponentChangePlan()` で計画を作り、設定値を確定した後にユーザーの明示承認を反映します。設定が不要な場合も、空の設定を明示的に確定する必要があります。`getApprovedComponentChanges()` は未承認、未解決、または承認後に変更された計画を拒否します。ユーザーが計画を承認した後に限り `approveComponentChangePlan()` を呼び出してください。

このパッケージは計画表示と承認ゲートまでを担当し、Unity MCP の書き込みや Component の追加は行いません。適用は後続の承認済み変更処理でのみ行います。

## 判定と CI

Component 要求は `satisfied`、`missing`、`ambiguous`、`unsupported`、`unverified` の状態で報告されます。照合対象を特定できない場合に任意の GameObject を選んで不足と判定することはありません。

解析レポートは `analyze <SceneGraph.toml> [script.ts] --format json|sarif|github-actions` で出力形式を選べます。既定のテキスト形式と終了コードは変更しません。形式と schema の詳細は[Analyzer レポート形式](../../docs/analysis-report-formats.md)を参照してください。

- `--fail-on-issues`: Analyzer の問題、または確定した required Component 不足があれば終了コード 1。
- `--strict-optional-lookups`: 未配置の `getUnityComponent` をエラー扱いにします。終了コードに反映するには `--fail-on-issues` も指定します。
- `--fail-on-unverified`: 曖昧・未対応・未検証の要求があれば終了コード 1

CI ですべての要求を確認するには、Export and Analyze に両方のオプションを指定します。MCP の応答は解析入力ではなく、Component の自動修正も行いません。

## 開発

```bash
npm run verify
```

解析 API や結果の型、データフローなどの開発向け詳細は [IMPLEMENTATION.md](IMPLEMENTATION.md) とリポジトリの [開発ガイド](../../docs/repository-guide.md) を参照してください。
