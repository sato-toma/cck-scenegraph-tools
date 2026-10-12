# 開発ロードマップ

## Phase 0: 開発を再現可能にする

- [ ] ルート README にセットアップ、Unity サンプル、analyzer 実行方法を集約する。
- [ ] `SceneGraph.toml` の fixture と schema テストを追加する。
- [ ] Node のバージョン、npm lock、CI の verify 手順を固定する。
- [ ] 解析結果の exit code を定義する。問題あり、入力エラー、実行エラーを分ける。

## Phase 1: SceneGraph.toml の構造を安定させる

- [ ] TOML の version/schemaVersion を追加する。
- [ ] `path` / `parent` / `id` の意味を一つに決める。
- [ ] ComponentProperty に Unity オブジェクト参照の識別情報を保持できる形式を追加する（現在は配列・入れ子配列まで対応し、参照は名前文字列）。
- [ ] Unity exporter の TOML 出力を Edit Mode テストで検証する。
- [ ] 差分更新でコンポーネントとプロパティが失われないようにする。

## Phase 2: 解析の正確性を上げる

- [ ] 正規表現 parser の限界を fixture で固定する。
- [ ] TypeScript Compiler API による AST parser を導入する。
- [ ] コメント、文字列、別名、optional chaining、改行、import を正しく扱う。
- [ ] ClusterScript API 定義をカテゴリ別かつデータ駆動で管理する。
- [ ] GameObject と ScriptableItem の対応を ID で一意に解決する。

## Phase 3: 人間の作業を短くする

- [x] Unity CLI の `-executeMethod` から SceneGraph.toml を全体出力する。
- [ ] Unity メニューに「export and analyze」を追加するか、CLI bridge を用意する。
- [ ] `analyze --watch` または Unity 保存後の再解析手順を整える。
- [ ] JSON/SARIF レポートを追加し、GitHub Actions の annotation に接続する。
- [ ] missing component から Unity 側の推奨設定を表示する。
- [ ] VS Code 拡張またはタスク定義でワンクリック解析を提供する。

## Phase 4: GitHub と Agent による継続メンテナンス

- [ ] PR で analyzer verify、fixture 解析、schema 互換性チェックを実行する。
- [ ] Unity が利用できる runner または定期的な Unity 手動検証手順を用意する。
- [ ] ClusterScript API の外部定義をスナップショット化し、更新差分をレビューする。
- [ ] Issue template に「入力 TOML」「ClusterScript」「期待する制約」を含める。
- [ ] Dependabot と定期的な API/依存関係更新を活用する。

## 優先順位

最初に Phase 0 と Phase 1 を進める。解析精度を上げても入力（SceneGraph.toml）の構造が揺れると結果を信頼できないため、AST 化や VS Code 統合より先に schema と CI の再現性を固める。
