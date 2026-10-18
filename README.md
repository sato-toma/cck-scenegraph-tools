# cck-scenegraph-tools

Cluster Creator Kit で作るワールドやアイテムの **ClusterScript と Unity Component の設定漏れを、シーン情報をもとに確認する開発支援ツール**です。

たとえば `$.onGrab()` を使うアイテムに、有効な `GrabbableItem` が設定されていない場合、Unity 上での動作確認前に対象の GameObject と不足内容を報告します。シーンの状態を Exporter で `SceneGraph.toml` に出力し、ClusterScript の要求と照合します。

## 主な機能

- API が必要とする Component と、対象 GameObject に設定された有効な Component を照合
- `missing`（不足）、`ambiguous`（対象が曖昧）、`unsupported`（未対応）、`unverified`（未検証）を理由とともに報告
- ClusterScript の一部のコード上の問題や、Cluster ワールドのアップロード要件を確認
- Unity シーンの Export と解析を連携し、VS Code の Problems や CI で結果を確認

## はじめ方

Node.js の要件、同梱サンプル、自分の Unity プロジェクトへの導入、VS Code での解析手順は[クイックスタート](docs/quickstart.md)を参照してください。

## ドキュメント

- [SceneGraph の Export と解析](docs/instructions/scenegraph-workflow.md)
- [解析レポート形式](docs/analysis-report-formats.md)
- [SceneGraph TOML スキーマ](docs/schema/scene-graph-toml.md)
- [Unity MCP セットアップ](docs/unity-mcp-setup.md)
- [リポジトリ構成と開発案内](docs/repository-guide.md)
- [データフローと責務](docs/architecture/data-flow.md)

静的解析のため、実行時の挙動や TypeScript の全構文を保証するものではありません。対応しない構文や対象を特定できない要求は、成功・不足と断定せず状態と理由を報告します。

## 開発

`packages/ts-analyzer` で `npm ci` の後に `npm run verify` を実行します。
