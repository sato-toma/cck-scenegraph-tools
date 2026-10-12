# 用語集

このリポジトリの設計資料で使う用語を定義します。Unity CLI MCP と SceneGraph の対応に関する詳細は [Unity CLI MCP 調査](unity-cli-mcp.md)、ファイル形式は [SceneGraph TOML スキーマ](schema/scene-graph-toml.md) を参照してください。

| 用語 | 意味 |
|---|---|
| Component | GameObject に付与される Unity の機能・データ。`type` は analyzer が照合する完全修飾型名。 |
| `enabled` | SceneGraph に記録される Component の有効状態。現 exporter は `Behaviour` / `Collider` から取得し、それ以外は `true` を出力する。MCPから取得できない場合は「有効」と推定しない。 |
| GameObject | Unity シーン内のオブジェクト。親子階層を持ち、Component を保持する。 |
| GlobalObjectId | Unity がオブジェクト識別に使う ID。SceneGraph と MCP の応答を同じオブジェクトに結び付けるために使う。GameObject 名や Hierarchy 上の位置とは別の識別子。 |
| Hierarchy path | ルートから対象 GameObject までの名前を区切って表す階層パス。SceneGraph の `path` は先頭 `/` を付けない。 |
| MCP | Model Context Protocol。Unity CLI が公開するツールを、対応クライアントから呼び出すためのプロトコル。 |
| SceneGraph | Unity シーン内の GameObject と Component の構造を表すデータ。現在の共有形式は `SceneGraph.toml`。 |
| unsupported | MCP が値を返さない、または現在の変換規則で安全に表せない状態。値の欠落と実際の `false` / 空値を区別するため、推測で補完しない。 |
| 完全修飾型名 | 名前空間を含む Component の型名。例: `UnityEngine.Rigidbody`。短縮名と異なり、型照合に使える識別名。 |
| シリアライズ済みフィールド | Unity が保存・表示する Component のフィールド値。MCP のフィールド名・型表現は SceneGraph の `properties` と同一とは限らない。 |
