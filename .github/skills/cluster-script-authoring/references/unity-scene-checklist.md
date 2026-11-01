# Unity シーン構成チェックリスト

ClusterScript を配置する Unity シーンの構成と、解析までの手順。

## 1. 解析ツールを準備する（任意）

解析には `cck-scenegraph-tools` の `ts-analyzer` を使う。リポジトリ外の場合は、clone してビルドする。

```bash
gh repo clone sato-toma/cck-scenegraph-tools
cd cck-scenegraph-tools/packages/ts-analyzer
npm ci
npm run build
```

## 2. Item を構成する

- ClusterScript を付ける GameObject を Item（ScriptableItem）として用意する。
- 使う API に必要な Component は、[Item Component の仕様](https://docs.cluster.mu/creatorkit/item-components/) を確認し、同じ GameObject に追加する。
- Collider が必要な API（`onInteract`）は、子 GameObject の有効な Collider でも満たせるかを Unity 上で確認する。確認していない場合は同じ GameObject に付ける。
- `onCollide` は Rigidbody が必要。`IsKinematic` の扱いは公式の Item Component 仕様を確認する。

## 3. ScriptableItem と ClusterScript を接続する

- ClusterScript のビルド結果（JavaScript）を Unity プロジェクトに配置し、対象 Item の ScriptableItem 参照に設定する。
- 参照先が未設定だと、コールバックは動作しない。Unity 上で参照を確認する。

## 4. 負例と正例で確認する

API ごとに次の 2 状態を用意する。

1. 必要 Component が不足、または無効化されている状態
2. 必要 Component がすべて有効な状態

負例で解析の指摘が出て、正例で指摘が消えることを確認する。

## 5. Export と解析

Unity の batch export で `SceneGraph.toml` を作る。

```powershell
& "<UnityEditorPath>\Unity.exe" -batchmode -quit `
  -projectPath "<UnityProjectPath>" `
  -executeMethod UnitySemanticGraph.Editor.Exporter.SelectiveComponentTomlExporter.ExportGraphToToml `
  -scenePath "Assets/<SceneName>.unity" `
  -outputPath "Assets/SceneGraph.toml"
```

終了コード `0` が成功、`1` が失敗。失敗時は Unity のログを確認する。

解析は、`SceneGraph.toml` と ClusterScript ソースを指定する。

```bash
node dist/cli.js analyze <path/to/SceneGraph.toml> <path/to/script.ts>
```

`--format json` などの出力形式は、`node dist/cli.js` のヘルプで確認する。

## 6. 結果の扱い

- 解析が通ることは、Component 要件を満たしたことの確認である。Cluster 上での動作は別途確認が必要。
- Cluster の実機で確認していない場合は、その旨を報告する。
- ワールドのアップロードは、ユーザーが明示的に依頼した場合のみ行う。
