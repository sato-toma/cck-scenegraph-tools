# ADR 0001: Unity exporter と analyzer の共有仕様を TOML に置く

- 状態: Accepted
- 日付: 2026-09-21

## 背景

Unity Editor と Node.js/TypeScript analyzer は異なる実行環境で動く。直接参照するのではなく、シーンの事実を `SceneGraph.toml` に保存し、analyzer はそのスナップショットを読む。

## 決定

`SceneGraph.toml` は、Unity exporter が Unity プロジェクト（シーン）の構造をダンプした構造化ファイルとし、TypeScript analyzer はこのファイルの構造をもとに静的解析する。そのため、この構造が exporter と analyzer の共有仕様になる。構造の中心は GameObject の安定 ID、階層パス、コンポーネント完全修飾型、enabled 状態、プロパティである。

## 理由

- Unity がなくても parser と analyzer を高速にテストできる。
- CI で ClusterScript の解析を再現できる。
- TOML を人間が確認、レビュー、保存できる。
- 将来 CLI、VS Code 拡張、CI が同じデータを利用できる。

## 影響

- TOML の変更は cross-package の変更になる。
- exporter と parser の片方だけを変更してはならない。
- schema の後方互換性とサンプル fixture を維持する必要がある。
- 大規模シーンではスナップショットのサイズと差分レビュー方法を検討する。

## 却下した案

Unity Editor 内で TypeScript を直接解析する案は、CI と開発環境に Unity を要求し、責務も混ざるため採用しない。
