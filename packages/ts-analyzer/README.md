# TypeScript Analyzer

ClusterScript の TypeScript を静的解析し、Unity シーンの設定漏れや対応していない使い方を確認するツールです。Unity のカスタム Exporter が出力した `SceneGraph.toml` を読み込み、API が要求する Component をスクリプトの対象 GameObject と照合します。

## セットアップ

```bash
npm ci
npm run build
```

## CLI

ビルド後、次のコマンドで SceneGraph とスクリプトを解析できます。

```bash
node dist/cli.js analyze <SceneGraph.toml> <script.ts>
```

主なコマンド:

```text
analyze       設定漏れや解析上の問題を表示
report        要求 Component と照合根拠を含むレポートを表示
coverage      ClusterScript API の利用状況を表示
recommend     推奨 Component を表示
scene-graph   SceneGraph の構造を表示
list-apis     対応 API を表示
```

Unity Exporter の実行から解析までをまとめて行う場合は、リポジトリルートの [export-and-analyze スクリプト](../../scripts/export-and-analyze.ps1) を利用してください。

## 判定と CI

Component 要求は `satisfied`、`missing`、`ambiguous`、`unsupported`、`unverified` の状態で報告されます。照合対象を特定できない場合に任意の GameObject を選んで不足と判定することはありません。

- `--fail-on-issues`: Analyzer の問題、または確定した Component 不足があれば終了コード 1
- `--fail-on-unverified`: 曖昧・未対応・未検証の要求があれば終了コード 1

CI ですべての要求を確認するには、Export and Analyze に両方のオプションを指定します。MCP の応答は解析入力ではなく、Component の自動修正も行いません。

## 開発

```bash
npm run verify
```

解析 API や結果の型、データフローなどの開発向け詳細は [IMPLEMENTATION.md](IMPLEMENTATION.md) とリポジトリの [開発ガイド](../../docs/repository-guide.md) を参照してください。
