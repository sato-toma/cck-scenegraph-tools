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
- `.github/copilot-instructions.md`
  - このリポジトリで Agent が守る作業規約
- `.github/skills/`
  - Unity 出力、TOML スキーマ、TypeScript 解析をまたぐ作業手順

## 基本的な利用手順

1. Unity の対象シーンを開く。
2. `SemanticGraph/Export All Component Graph to TOML` で全体を出力する。
3. 必要なら `SemanticGraph/Update Selected Component Graph to TOML` で選択範囲を更新する。
4. TypeScript analyzer で `SceneGraph.toml` と ClusterScript を解析する。
5. Component の不足を修正する場合は `ts-analyzer plan <SceneGraph.toml> <Unity-scene-path> [script.ts]` で追加候補を確認する。承認済み計画の適用では Unity CLI MCP の `add_component` を使い、各対象を適用直前に再確認する。未承認・対象不一致・曖昧な対象では適用しない。適用後の再出力と解析は別途実行する。

TypeScript 側の `applyApprovedComponentChangePlanViaUnityCliMcp` は `.mcp.json` の `unity` stdio サーバーを起動し、承認済み `ComponentChangePlan` を Unity CLI MCP に直接適用する。適用前に計画の承認状態を検証するため、呼び出し側はユーザーの明示承認後にのみ実行する。承認 UI は提供しない。変更前後の状態と失敗時の監査記録は戻り値または例外から確認する。

### Unity CLIでの全体出力

CIやスクリプトからはUnity Editorのbatchmodeを使用します。

```powershell
Unity.exe -batchmode -quit `
  -projectPath "C:\path\to\UnityProject" `
  -executeMethod UnitySemanticGraph.Editor.Exporter.SelectiveComponentTomlExporter.ExportGraphToToml `
  -scenePath "Assets/Scenes/Main.unity" `
  -outputPath "SceneGraph.toml"
```

`-scenePath`はプロジェクト相対または絶対パス、`-outputPath`はプロジェクト相対または絶対パスを指定できます。引数を省略した場合は、アクティブシーンとプロジェクト直下の`SceneGraph.toml`を使用します。batchmodeで失敗した場合は終了コード1です。

### Export and Analyze 一括実行

リポジトリルートのNode.jsスクリプトが、Unity exportとTypeScript analyzerを連続して実行します。

- Windows: `scripts/export-and-analyze.ps1`
- Linux/macOS: `scripts/export-and-analyze.sh`
- npm: `cd packages/ts-analyzer && npm run scenegraph:analyze -- ...`

共通オプションは`--project-path`、`--scene-path`、`--script-path`、`--output-path`、`--unity-path`です。`--fail-on-issues`を付けると、analyzer issue または確定した Component 要求の不足で終了コード1を返します。`--fail-on-unverified`を付けると、曖昧・未対応・未検証の要求でも終了コード1を返します。すべての要求を確認済みにする CI では両方を指定してください。Unityの場所は`UNITY_PATH`環境変数でも指定できます。

## 変更の境界

- API ルールだけの変更は `packages/ts-analyzer/src/rules/` とテストを中心に変更する。
- TOML の項目や型を変更する場合は、Unity exporter、parser、型、サンプル、文書を同時に確認する。
- Unity exporter の変更は、最低限サンプル出力を目視確認し、将来は Unity Edit Mode テストで固定する。
- 解析結果の終了コードを変更する場合は、CLI と CI の利用方法を同時に更新する。
