# SceneGraph ワークフロー手順

この文書では、Unity シーンの出力、ClusterScript の解析、Component 変更の確認手順を説明します。全体像は[リポジトリ案内](../repository-guide.md)、TOML の項目と互換性は[スキーマ](../schema/scene-graph-toml.md)を参照してください。

## SceneGraph を出力する

Unity Editor で対象シーンを開き、次のメニューから全体または選択範囲を出力します。

- `SemanticGraph/Export All Component Graph to TOML`
- `SemanticGraph/Update Selected Component Graph to TOML`

CI やスクリプトでは batchmode を使用できます。

```powershell
Unity.exe -batchmode -quit `
  -projectPath "C:\path\to\UnityProject" `
  -executeMethod UnitySemanticGraph.Editor.Exporter.SelectiveComponentTomlExporter.ExportGraphToToml `
  -scenePath "Assets/Scenes/Main.unity" `
  -outputPath "SceneGraph.toml"
```

`-scenePath` と `-outputPath` はプロジェクト相対または絶対パスです。省略時はアクティブシーンとプロジェクト直下の `SceneGraph.toml` が使われます。batchmode の失敗は終了コード `1` です。

## Export と解析を一括実行する

リポジトリルートのスクリプトまたは `packages/ts-analyzer` の npm コマンドを利用します。

- Windows: `scripts/export-and-analyze.ps1`
- Linux/macOS: `scripts/export-and-analyze.sh`
- npm: `npm run scenegraph:analyze -- ...`

例:

```powershell
Set-Location packages/ts-analyzer
npm run scenegraph:analyze -- `
  --project-path "C:\path\to\UnityProject" `
  --scene-path "Assets/Scenes/Main.unity" `
  --script-path "C:\path\to\UnityProject\Assets\Script\main.ts" `
  --unity-path "C:\Program Files\Unity\Hub\Editor\<version>\Editor\Unity.exe"
```

`--project-path`、`--scene-path`、`--script-path`、`--output-path`、`--unity-path`、`--log-path` を指定できます。`--output-path` の既定値はプロジェクト直下の `SceneGraph.generated.toml` です。Unity Editor が終了時に消去する `Temp` 配下を出力先にしないでください。

- `--fail-on-issues`: analyzer issue または確定した required Component 不足で終了コード `1` を返します。`getUnityComponent` の未配置は既定では対象外ですが、`--strict-optional-lookups` も指定するとエラーとして対象になります。
- `--fail-on-unverified`: `ambiguous` / `unsupported` / `unverified` の要求でも終了コード `1` を返します。

確認済みを必須にする場合は両方指定します。Unity Editor のパスは `UNITY_PATH` 環境変数でも指定できます。

## Component 変更計画を適用・再検証する

1. `ts-analyzer plan <SceneGraph.toml> <Unity-scene-path> [script.ts]` で追加候補を作ります。`getUnityComponent` の未配置Componentも任意候補として表示されます。
2. 対象 GameObject、Component 型、設定値を確認します。計画を変更する場合は、確認後に明示承認します。
3. 承認済み計画だけを MCP 経由で適用します。未承認、対象不一致、対象が曖昧な場合は適用しません。
4. 必要なら適用後に Exporter で再出力し、構造と静的解析の結果を確認します。

適用と再検証をまとめる TypeScript API:

```ts
const report = await applyAndVerifyComponentChangePlanViaUnityCliMcp(
  approvedPlan,
  {
    configPath: ".mcp.json",
    projectPath: "C:/path/to/UnityProject",
    sceneGraphPath: "C:/path/to/UnityProject/SceneGraph.toml",
  },
);
console.log(formatComponentChangeVerificationReport(report));
```

計画内の証拠から TypeScript ファイルを解決できない場合は、`sourcePaths` を明示します。呼び出し側は `report.status` を確認し、`success` 以外を成功扱いしないでください。Exporter が設定値を出力しない場合、その値の状態は `unverified` です。

### 結果の型と手動修正用レポート

状態値は自由記述ではなく、実行時定数と TypeScript 型の組で公開しています。JSON 等にシリアライズしても扱える安定したコード値です。

- `COMPONENT_CHANGE_ACTION_STATUSES`: `added`、`already-present`、`failed`、`not-attempted`
- `COMPONENT_CHANGE_CHECK_STATUSES`: `verified`、`failed`、`unverified`
- `COMPONENT_CHANGE_VERIFICATION_STATUSES`: `success`、`failure`、`unverified`

対応する型は `ComponentChangeActionStatus`、`ComponentChangeCheckStatus`、`ComponentChangeVerificationStatus` です。例:

```ts
if (report.status !== COMPONENT_CHANGE_VERIFICATION_STATUSES.success) {
  console.error(formatComponentChangeVerificationReport(report));
}
```

レポートには手動で対象を探せるよう、GameObject の GlobalObjectId と階層パス、Component 型、変更状態、承認した設定値、Exporter が読み取った設定値、検証結果を表示します。このフローは Component の追加・設定のみで Assets を作成しないため、Assets 一覧は出力しません。

この検証が確認するのは SceneGraph 上の構造と静的制約です。スクリプトの実行時動作や Unity Console エラーを保証・診断するものではありません。Console 診断と承認後の修正フローは別途扱います。
