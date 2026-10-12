# cck-scenegraph-tools

Cluster Creator Kit の Unity シーンを `SceneGraph.toml` に出力し、ClusterScript の TypeScript コードが必要とする Unity コンポーネントを静的解析するプロジェクトです。

## リポジトリ構成

- `packages/unity-semantic-graph/`: Unity Package と Editor の TOML exporter
- `packages/unity-semantic-graph/Samples~/`: サンプル Unity プロジェクトと `SceneGraph.toml`
- `packages/ts-analyzer/`: TOML parser、ClusterScript parser、制約 validator、CLI
- `packages/ts-analyzer/src/rules/`: 物理、インタラクション、移動、state変更のルール
- `docs/`: データフロー、TOML スキーマ、ADR、開発ロードマップ

詳しい案内は [docs/repository-guide.md](docs/repository-guide.md) を参照してください。
リポジトリで使う用語は [用語集](docs/glossary.md) を参照してください。

## 基本フロー

1. Unity で `SemanticGraph/Export All Component Graph to TOML` を実行する。
2. 出力された `SceneGraph.toml` と ClusterScript を analyzer に渡す。
3. API が要求するコンポーネントとシーン上のコンポーネントを照合する。
4. 不足コンポーネント、無効な設定、state の直接変更を修正する。

## Unity CLIからのTOML出力

Unity Editorを起動せずに、batchmodeの`-executeMethod`からアクティブシーンを出力できます。

```powershell
Unity.exe -batchmode -quit `
	-projectPath "C:\path\to\UnityProject" `
	-executeMethod UnitySemanticGraph.Editor.Exporter.SelectiveComponentTomlExporter.ExportGraphToToml `
	-scenePath "Assets/Scenes/Main.unity" `
	-outputPath "SceneGraph.toml" `
	-logFile "Logs/scenegraph-export.log"
```

`-scenePath`を省略すると現在のアクティブシーンを使い、`-outputPath`を省略するとUnityプロジェクト直下の`SceneGraph.toml`へ出力します。出力に失敗した場合、batchmodeは終了コード1になります。

## Export and Analyze

UnityのTOML出力とClusterScript解析を一度に実行できます。Node.jsを共通実装として使用するため、Windows、Linux、macOSで同じ引数を使えます。WindowsではPowerShell、Linux/macOSではシェルスクリプトも利用できます。

```powershell
./scripts/export-and-analyze.ps1 `
	--unity-path "C:\Program Files\Unity\Hub\Editor\6000.2.6f2\Editor\Unity.exe" `
	--project-path "C:\path\to\UnityProject" `
	--scene-path "Assets/Scenes/Main.unity" `
	--script-path "C:\path\to\script.ts" `
	--fail-on-issues
```

```bash
./scripts/export-and-analyze.sh \
	--project-path /path/to/UnityProject \
	--scene-path Assets/Scenes/Main.unity \
	--script-path /path/to/script.ts \
	--fail-on-issues
```

同じ処理は`packages/ts-analyzer`からnpm commandでも実行できます。

```bash
cd packages/ts-analyzer
npm run scenegraph:analyze -- \
	--project-path ../unity-semantic-graph/Samples~ \
	--scene-path Assets/test.unity \
	--script-path ../unity-semantic-graph/Samples~/Assets/Script/src/onGrabScript.ts
```

Unity Editorの場所は`--unity-path`または`UNITY_PATH`環境変数で指定できます。iOS向けの場合も、iOS端末上ではなくmacOS上のUnity Editorからこのスクリプトを実行します。

```bash
cd packages/ts-analyzer
npm install
npm run verify
npx ts-analyzer analyze ./SceneGraph.toml ./script.ts
```

## Unity MCP（GitHub Copilot Agent mode 連携）

Unity CLI に組み込まれた MCP サーバーを使い、VS Code の GitHub Copilot Agent mode から起動中の Unity Editor のシーン情報を読み取れます。独自の MCP サーバーは実装していません。

- 設定ファイル: [`.mcp.json`](.mcp.json)。`unity mcp` を起動し、`packages/unity-semantic-graph/Samples~` を対象にします。VS Code、Copilot CLI など対応クライアントが読む共通形式で、絶対パスやユーザー固有の値は含めません。
- 必要なもの: Windows、VS Code 1.141 以降（GitHub Copilot Chat は同梱）、Unity CLI（`winget install --id Unity.CLI --exact`）、Unity 6000.2.6f2、GitHub Copilot のサインイン。
- 導入手順、設定方針、動作確認、トラブルシューティング: [docs/unity-mcp-setup.md](docs/unity-mcp-setup.md)
- AI エージェント向けの作業手順: [.github/skills/unity-mcp-setup/SKILL.md](.github/skills/unity-mcp-setup/SKILL.md)
- 調査結果と SceneGraph との対応: [docs/unity-cli-mcp.md](docs/unity-cli-mcp.md)

Unity MCP は、変更系のツールも公開します。初期段階では読み取り専用のツールだけを使い、MCP が使えなくても既存の静的解析は単独で実行できます。

## 設計資料

- [Unity MCP セットアップ](docs/unity-mcp-setup.md)
- [Unity CLI MCP 調査](docs/unity-cli-mcp.md)
- [データフローと責務](docs/architecture/data-flow.md)
- [SceneGraph TOML スキーマ](docs/schema/scene-graph-toml.md)
- [ADR 0001: Unity exporter と analyzer の共有仕様](docs/adr/0001-cross-package-contract.md)
- [開発ロードマップ](docs/development-roadmap.md)