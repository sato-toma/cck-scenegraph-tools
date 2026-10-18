# クイックスタート

同梱データで解析結果を確認してから、自分の Unity プロジェクトを解析する手順です。

## 必要なツールとバージョン

| 用途 | ツール | バージョン・条件 |
| --- | --- | --- |
| 解析器 | Node.js | `packages/ts-analyzer/.nvmrc` で指定（現在 24.x） |
| Exporter・サンプル Unity プロジェクト | Unity Editor | 6000.2.6f2 で動作確認。Unity Pipeline 操作には Unity 6.0 LTS 以上 |
| ClusterScript・サンプル Unity プロジェクト | Cluster Creator Kit | 3.0.0 以上。解析器は 3.4.0 で動作確認 |
| VS Code から Unity MCP を使う場合 | VS Code / GitHub Copilot Chat | 1.141.0 / 0.69.0 で確認 |
| 任意の Unity MCP 操作 | Unity CLI | 1.0.0-beta.13 で確認 |
| 任意の Unity MCP 操作 | Unity Pipeline package | 0.8.0-exp.1（実験的。通常の Export・解析には不要） |

Unity と Cluster Creator Kit の組み合わせはプロジェクトごとに互換性を確認してください。Unity CLI と Unity Pipeline package は MCP 操作にのみ使う任意のツールです。

## 同梱サンプルを解析する

必要なツールを用意し、リポジトリのルートから実行します。

```powershell
Set-Location packages\ts-analyzer
npm ci
npm run build
node dist\cli.js analyze src\fixtures\scene-graph-export.toml examples\sample.ts
```

サンプルでは満たされた要求と不足した要求の両方が表示されます。`src\fixtures\scene-graph-export.toml` は説明用の固定データで、自分の Unity シーンを表すものではありません。

## Unity プロジェクトを解析する

Unity の Package Manager で **Add package from git URL** を選び、次の URL を追加します。

```text
https://github.com/sato-toma/cck-scenegraph-tools.git?path=packages/unity-semantic-graph
```

解析器をビルドした後、リポジトリのルートで Unity Editor、プロジェクト、シーン、ClusterScript のパスを指定します。

```powershell
Set-Location packages\ts-analyzer
npm ci
npm run build
Set-Location ..\..

& .\scripts\export-and-analyze.ps1 `
  --unity-path "C:\Program Files\Unity\Hub\Editor\<version>\Editor\Unity.exe" `
  --project-path "C:\path\to\UnityProject" `
  --scene-path "Assets/Scenes/Main.unity" `
  --script-path "C:\path\to\script.ts" `
  --fail-on-issues `
  --fail-on-unverified
```

`--fail-on-issues` は確定した問題や Component 不足で、`--fail-on-unverified` は曖昧・未対応・未検証の要求でも終了コード `1` を返します。CI で全てを確認する場合は両方を指定してください。Unity Editor のパスは `UNITY_PATH` 環境変数でも指定できます。

## VS Code で解析する

リポジトリのルートを VS Code で開き、`Tasks: Run Task` から次のタスクを選びます。

- `SceneGraph: Unityシーンを出力して解析`: Unity からシーン情報を出力して一度解析します。
- `SceneGraph: 保存時に再解析して問題を表示`: 出力済み `SceneGraph.toml` と ClusterScript を監視し、保存後に再解析して VS Code の問題一覧に表示します。

タスクの案内に従って各パスを入力してください。watch タスクを使う場合、Unity から同じ `SceneGraph.toml` の保存先へ再 Export します。問題がある場合は CLI の[レポート形式](analysis-report-formats.md)も参照してください。

## トラブルシューティング

- `Analyzer build not found`: `packages\ts-analyzer` で `npm ci` と `npm run build` を実行します。
- Exporter が見つからない: Unity Package Manager で上記パッケージが導入され、Unity のコンパイルが完了していることを確認します。
- `unverified` / `ambiguous`: SceneGraph の `ScriptableItem` と ClusterScript の割り当て、レポートの対象 GameObject と根拠を確認します。
- アップロード要件エラー: SceneGraph に記録された Spawn Point / Despawn Height など、Cluster ワールドの要件を確認します。

## Unity MCP を使った修正支援

解析結果をもとに Copilot Agent mode と Unity CLI MCP でシーンを確認し、修正案を承認してから Component を変更できます。Component の自動修正は行いません。解析の正規入力は MCP 応答ではなく、Exporter が出力する `SceneGraph.toml` です。`.mcp.json` は同梱サンプル Unity プロジェクト向けなので、実プロジェクトを操作する前に接続先を確認してください。

## 解析の範囲

静的解析は実行時のすべての挙動や TypeScript の全構文を検証するものではありません。対応しない構文や特定できない対象は、成功・不足と断定せず状態と理由を報告します。データ形式は[SceneGraph TOML スキーマ](schema/scene-graph-toml.md)を参照してください。
