# リポジトリ案内

## 目的

このリポジトリは、Cluster Creator Kit を使う Unity プロジェクトからシーン構造を `SceneGraph.toml` として出力し、ClusterScript の TypeScript コードが必要とする Unity コンポーネントを静的解析するための基盤です。

判定は現在、次の情報を文字列として照合します。

- TypeScript から検出した ClusterScript API
- API に定義された必要コンポーネント
- TOML に記録された GameObject とコンポーネント
- 必要に応じた親 GameObject のコンポーネント

## 構成

- `packages/ts-analyzer/`
  - TypeScript 製の解析ライブラリと CLI
  - `src/index.ts` と `src/cli.ts`: ライブラリと CLI のエントリポイント
  - `src/analysis/`: 解析、Component 要求、変更計画
  - `src/sceneGraph/`: SceneGraph TOML と MCP 応答の読み取り
  - `src/validation/`: Component 制約とアップロード条件の検証
  - `src/domain/`: 解析・SceneGraph の共有型
  - `src/rules/`: API 制約と物理、インタラクション、移動、state変更のルール
  - `src/reporting/`: 解析結果や計画のテキスト整形
  - `src/integration/`: Exporter 出力との統合テスト
  - `src/fixtures/`: MCP 応答などの変換テスト用fixture
  - `examples/`: CLI の実行例
  - `IMPLEMENTATION.md`: 現在の実装ガイド
- `packages/unity-semantic-graph/`
  - Unity Package と Editor 拡張
  - `Editor/Exporter/SelectiveComponentTomlExporter.cs`: シーンから TOML を出力
  - `Runtime/`: Runtime assembly 定義
  - `Samples~/`: 実際に開けるサンプル Unity プロジェクト
  - `Tests/`: Unity Test Framework 用パッケージ定義
- `.github/workflows/`
  - 現在は TypeScript analyzer の build/test を実行
- `docs/`
  - 設計、SceneGraph.toml の構造定義、ADR、開発計画
  - `instructions/`: 利用者向けの詳細なシーン操作・解析手順
- `.github/copilot-instructions.md`
  - このリポジトリで Agent が守る作業規約
- `.github/skills/`
  - Unity 出力、TOML スキーマ、TypeScript 解析をまたぐ作業手順

## 基本的な利用手順

1. Unityでシーンを `SceneGraph.toml` に出力する。
2. TypeScript analyzer でシーンとClusterScriptを解析する。
3. Component不足を直す場合は、変更計画を確認・承認してから適用する。

Export、解析、変更計画の詳細は[SceneGraphワークフロー手順](instructions/scenegraph-workflow.md)を参照してください。

## 変更の境界

- API ルールだけの変更は `packages/ts-analyzer/src/rules/` とテストを中心に変更する。
- TOML の項目や型を変更する場合は、Unity exporter、parser、型、サンプル、文書を同時に確認する。
- Unity exporter の変更は、最低限サンプル出力を目視確認し、将来は Unity Edit Mode テストで固定する。
- 解析結果の終了コードを変更する場合は、CLI と CI の利用方法を同時に更新する。
