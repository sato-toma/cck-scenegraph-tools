# cck-scenegraph-tools

Cluster Creator Kit で作ったワールドやアイテムの **ClusterScript と Unity Component の設定漏れを、シーンをもとにチェックする開発支援ツール**です。

`$.onGrab()` を使うアイテムに有効な `GrabbableItem` がない、といった不整合を、Unity 上での動作確認やワールド公開前に見つけることを目指します。

## できること

- Unity のシーンをカスタム Exporter で `SceneGraph.toml` に出力し、ClusterScript が使う API の Component 要件と照合
- Component の有効状態と、スクリプトが割り当てられた GameObject との対応を確認
- `missing`（不足）、`ambiguous`（対象が曖昧）、`unsupported`（未対応）、`unverified`（未検証）などの状態と根拠を報告
- `$.state` の直接変更など、対応する ClusterScript の静的チェック
- Export and Analyze 実行時に Cluster ワールドのアップロード要件を検証

## 使い方

Unity Editor と Node.js を用意し、Unity プロジェクト・シーン・ClusterScript を指定して実行します。

```powershell
./scripts/export-and-analyze.ps1 `
  --unity-path "C:\Program Files\Unity\Hub\Editor\<version>\Editor\Unity.exe" `
  --project-path "C:\path\to\UnityProject" `
  --scene-path "Assets/Scenes/Main.unity" `
  --script-path "C:\path\to\script.ts" `
  --fail-on-issues `
  --fail-on-unverified
```

このコマンドはカスタム Exporter でシーンを書き出し、解析レポートを表示します。`--fail-on-issues` は確定した Component 不足などで、`--fail-on-unverified` は曖昧・未対応・未検証の要求で終了コード 1 を返します。すべてを CI で検査する場合は両方を指定してください。

## Unity MCP を使った修正支援

解析で不足を見つけた後、VS Code の Copilot Agent mode と Unity CLI MCP を使って対象シーンを確認し、**修正案を承認してから** Component を追加する開発フローを想定しています。変更後は Exporter で再出力し、再解析して確認します。

Component の自動修正は組み込まれていません。MCP は任意の補助手段であり、解析の正規入力は MCP 応答ではなく Exporter が出力する `SceneGraph.toml` です。現在の [`.mcp.json`](.mcp.json) は同梱サンプル Unity プロジェクト向けなので、実プロジェクトを操作する前に接続先を確認してください。

## 対象範囲

静的解析のため、実行時のすべての挙動や TypeScript の全構文を検証するものではありません。対応しない構文や特定できない対象は、成功・不足と断定せず状態と理由を報告します。

## 詳細

- [リポジトリ案内](docs/repository-guide.md)
- [SceneGraph の操作・解析手順](docs/instructions/scenegraph-workflow.md)
- [Unity MCP のセットアップ](docs/unity-mcp-setup.md)
- [Unity MCP の調査と制約](docs/unity-cli-mcp.md)
- [SceneGraph TOML スキーマ](docs/schema/scene-graph-toml.md)
- [データフローと責務](docs/architecture/data-flow.md)

テストとビルドは `packages/ts-analyzer` で `npm ci` の後に `npm run verify` を実行してください。
