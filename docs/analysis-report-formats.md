# Analyzer レポート形式

`ts-analyzer analyze` と `npm run scenegraph:analyze` は、既定では従来のテキストレポートを出力します。`--format` を明示すると、機械可読レポートまたは GitHub Actions annotation を出力できます。

## CLI

`packages/ts-analyzer` で依存関係をインストールしてビルドした後に実行します。

```powershell
node dist\cli.js analyze <SceneGraph.toml> <script.ts> --format json
node dist\cli.js analyze <SceneGraph.toml> <script.ts> --format sarif
node dist\cli.js analyze <SceneGraph.toml> <script.ts> --format github-actions
node dist\cli.js analyze <SceneGraph.toml> <script.ts> --format vscode-problems
```

`vscode-problems` は VS Code の Problem Matcher が読める絶対パス付きの1行1診断形式です。保存のたびに再解析する場合は、`--watch` と組み合わせます。watch は SceneGraph と明示した TypeScript ファイルを監視し、`text` または `vscode-problems` のみ対応します。

```powershell
node dist\cli.js analyze <SceneGraph.toml> <script.ts> --watch --format vscode-problems
```

Unity の Export と解析を一括で実行する場合:

```powershell
npm run --silent scenegraph:analyze -- `
  --project-path "C:\path\to\UnityProject" `
  --scene-path "Assets/Scenes/Main.unity" `
  --script-path "C:\path\to\script.ts" `
  --format json
```

構造化形式を指定したとき、レポート本体は標準出力だけに出力されます。Export の進行状況やエラーは標準エラーに出力します。`--format` だけでは終了コードを変えません。`--strict-optional-lookups` を指定すると、未配置の `getUnityComponent` をエラー診断として出します。終了コードを使った検査は既存の `--fail-on-issues` / `--fail-on-unverified` と組み合わせてください。

## JSON

`--format json` は次の versioned envelope を出力します。

```json
{
  "schemaVersion": 1,
  "results": [
    {
      "filePath": "Assets/Script/main.ts",
      "issues": [],
      "componentRequests": [],
      "summary": {
        "totalIssues": 0,
        "errorCount": 0,
        "warningCount": 0,
        "componentRequestCounts": {
          "satisfied": 0,
          "missing": 0,
          "ambiguous": 0,
          "unsupported": 0,
          "unverified": 0,
          "optionalLookupMissing": 0
        }
      }
    }
  ]
}
```

`results` の各要素には、ファイル単位の `issues`、`componentRequests`、`summary` を含みます。`componentRequests` は要求された型、対象 GameObject、照合状態、根拠、ソース位置を保持します。`$.getUnityComponent("Type")` の要求には `kind: "optional-lookup"` が付き、対象ScriptableItem上に型がない場合は `verificationStatus: "missing"` でも `componentRequestCounts.missing` ではなく `optionalLookupMissing` に数えます。既定では警告で、正常な `null` 戻り値を理由に `--fail-on-issues` は失敗しません。`--strict-optional-lookups` 指定時は要求に `severity: "error"` が付き、`summary.errorCount` / `totalIssues` にも反映されます。後方互換性のない変更を行う場合は `schemaVersion` を更新します。

## SARIF

`--format sarif` は SARIF 2.1.0 を出力します。`$schema` は HTTPS のバージョン固定 URL を示すメタデータであり、Analyzer は実行時に外部からスキーマを取得しません。SARIF の仕様バージョンを更新する場合は、対応する出力実装とテストを更新してください。schema URL は仕様バージョンから組み立てられ、別々の値が食い違わないようになっています。

満たされない要件を SARIF result として含め、required の `missing` は `error`、optional lookup の `missing` は既定で `warning`、`--strict-optional-lookups` 指定時は `error` とします。`ambiguous` / `unsupported` / `unverified` は `warning` です。`satisfied` は finding ではないため SARIF results から省きます。Component 要求の詳細は result の `properties.componentRequest` に保持します。

GitHub Actions の artifact upload や SARIF consumer に渡す場合は、標準出力を `.sarif` ファイルへリダイレクトします。source URI は GitHub Actions では `GITHUB_WORKSPACE` を基準にします。

## GitHub Actions annotation

`--format github-actions` は、各未解決 Component 要求と他の analyzer issue を GitHub workflow command として標準出力に出します。required の `missing` は `error`、optional lookup の `missing` は既定で `warning`、`--strict-optional-lookups` 指定時は `error`、その他の未解決状態は `warning`、`info` issue は `notice` です。Annotation の file / line / column は、ソースファイルと該当位置を指します。

```yaml
- name: Analyze ClusterScript
  working-directory: packages/ts-analyzer
  run: |
    npm run scenegraph:analyze -- --project-path "$UNITY_PROJECT" --scene-path "$UNITY_SCENE" --script-path "$CLUSTERSCRIPT" --format github-actions
```

Component 不足は `componentRequests` を正規の診断元とし、同じ位置・API の `MISSING_COMPONENT` issue を重ねて annotation しません。既定のテキスト出力には影響しません。
