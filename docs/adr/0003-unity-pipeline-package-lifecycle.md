# ADR 0003: Unity Pipeline package の作業時導入と復元

- 状態: Accepted
- 日付: 2026-10-12
- 関連: [Unity MCP セットアップ](../unity-mcp-setup.md)、[Unity CLI MCP 調査](../unity-cli-mcp.md)

## 背景

Unity CLI MCP が Editor と通信するには、サンプルプロジェクトに `com.unity.pipeline` が必要である。一方、analyzer と SceneGraph exporter の通常利用には不要であり、`Samples~` の全利用者にMCP用パッケージを必須化する理由はない。

2026-10-12 に検証したパッケージは `0.8.0-exp.1` で、Unity Pipeline は実験的パッケージである。実験的であることは将来の互換性変更の可能性を意味するが、確認時点で特定の破壊的変更予定は確認されていない。

## 決定

- Unity MCP を使う作業では、AIエージェントが作業開始時に Pipeline の有無を確認し、必要なら `unity pipeline install --project-path packages/unity-semantic-graph/Samples~` で事前導入してよい。MCPツールが見えない場合に初めて導入を検討するのではなく、対象タスクがUnity MCPを必要とすると分かった時点で導入する。
- 現行の実験的バージョンでは導入をタスク内のローカル状態に限る。導入で変化する `Samples~/Packages/manifest.json` と `packages-lock.json` はコミットしない。
- Unity Editor を閉じた後、導入前に2ファイルが変更されていなかった場合に限り、作業完了時に導入による差分を復元する。導入前から差分がある場合は一括復元せず、既存変更を保持する。安全に導入分だけを戻せない場合はユーザーに確認する。
- Pipeline が実験的でない安定版として提供され、対象Unity Editorとの互換性を確認できた場合、Unity MCPを使うタスクの開始前に事前導入してよい。安定版への移行だけで `Samples~` の必須依存やコミット対象に変更するわけではない。
- `Samples~` に Pipeline を標準依存としてコミットする場合は、別の明示的な設計判断を必要とする。対応Unity/CLIの範囲、CIまたは手動検証、更新・ロールバック手順を確認する。

## 根拠とリスク

- タスク時導入なら、MCPを使わないサンプル利用者に実験的依存関係を追加せずに済む。
- `packages-lock.json` により作業中の依存解決を固定できるが、package manifest自体をコミットしない限り、別環境のMCP利用者には自動導入されない。
- 実験的リリースにはAPI変更やEditor互換性変更のリスクがある。現時点で予定された破壊的変更があるという意味ではない。
- PipelineなしでもExporterとanalyzerの通常フローが動くことを保つ。

## 再検討条件

- Pipelineが安定版へ移行した。
- 検証対象のUnity Editorバージョンが増減した。
- PipelineがExporter/analyzerの通常利用にも必要になった。
- Unity CLI / Pipeline更新で既存のMCPセットアップ手順が動かなくなった。
