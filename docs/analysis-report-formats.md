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

構造化形式はレポートを標準出力に出力します。`--format` は終了コードに影響しません。CI では `--fail-on-issues` と `--fail-on-unverified` で失敗条件を指定します。
`--fail-on-issues` は analyzer issue と required Component 不足、`--fail-on-unverified` は `ambiguous` / `unsupported` / `unverified` で失敗します。optional lookup は strict モード時だけ前者に含まれます。
`addForce` を `onPhysicsUpdate` 以外から呼び出すと `INVALID_API_CONTEXT` error を報告します。ネストした関数内など、直接のコールバック文脈を特定できない場合は `UNVERIFIED_API_CONTEXT` warning を報告します。

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

各 result は `issues`、`componentRequests`、`summary` を持ちます。要求の型、対象、状態、根拠、ソース位置は `componentRequests` に含まれます。互換性のない変更では `schemaVersion` を更新します。

`getUnityComponent` のリテラル型が対象 GameObject にない場合、`kind: "optional-lookup"` と `optionalLookupMissing` で記録します。既定は警告です。`--strict-optional-lookups` を指定すると要求の `severity` が `error` になり、`--fail-on-issues` の対象になります。

## SARIF

`--format sarif` は SARIF 2.1.0 を出力します。`$schema` は HTTPS のバージョン固定 URL を示すメタデータであり、Analyzer は実行時に外部からスキーマを取得しません。SARIF の仕様バージョンを更新する場合は、対応する出力実装とテストを更新してください。schema URL は仕様バージョンから組み立てられ、別々の値が食い違わないようになっています。

未解決の要求を SARIF result に含め、required の `missing` は `error`、`ambiguous` / `unsupported` / `unverified` は `warning` とします。`satisfied` は省略し、要求の詳細は `properties.componentRequest` に保持します。

GitHub Actions の artifact upload や SARIF consumer に渡す場合は、標準出力を `.sarif` ファイルへリダイレクトします。source URI は GitHub Actions では `GITHUB_WORKSPACE` を基準にします。

## GitHub Actions annotation

`--format github-actions` は未解決要求と analyzer issue を workflow annotation として出力します。required の `missing` は `error`、その他の未解決状態は `warning`、`info` は `notice` です。位置情報はソースの file / line / column を指します。

```yaml
- name: Analyze ClusterScript
  working-directory: packages/ts-analyzer
  run: |
    npm run scenegraph:analyze -- --project-path "$UNITY_PROJECT" --scene-path "$UNITY_SCENE" --script-path "$CLUSTERSCRIPT" --format github-actions
```

Component 不足は `componentRequests` を正規の診断元とし、同じ位置・API の `MISSING_COMPONENT` issue を重ねて annotation しません。既定のテキスト出力には影響しません。
