---
marp: true
theme: default
paginate: true
size: 16:9
title: cck-scenegraph-tools
description: Cluster Creator Kit 向け SceneGraph と ClusterScript 静的解析の概要
style: |
  section {
    font-family: "Yu Gothic", "Meiryo", sans-serif;
    font-size: 28px;
    padding: 54px 72px;
  }
  h1 { color: #0b5269; }
  h2 { color: #0b5269; }
  strong { color: #b54708; }
  code { color: #0b5269; }
---

# cck-scenegraph-tools

### Unity シーン設定と ClusterScript の整合性を、実行前に検査する

- Unity のコンポーネント構成を `SceneGraph.toml` として出力
- ClusterScript の API 利用と照合し、設定漏れを発見
- 対象: Cluster Creator Kit (CCK) の開発・レビュー・CI

<!--
話すこと: 「Unityのシーン設定」と「ClusterScript」の依存を、実行前に確認するための基盤です。
目安: 15秒
-->

---

## 当初の課題

- Script は API を呼べても、**必要な Unity コンポーネントがない**と期待どおり動かない
- 例: `onGrab()` には `GrabbableItem`、`onCollide()` には `Rigidbody` が必要
- 設定漏れは Cluster へワールドをアップロードして実行するまで発見しづらい
- 原因調査のために、後から `$.log()` などのログ出力を追加することもある
- シーンとコードは別々に管理され、レビューで依存関係を追いづらい

> 目標: 設定漏れを **実行前・自動** に検出する

<!--
話すこと: コードの型検査だけではUnity側の設定まで保証できない点が出発点です。
目安: 25秒
-->

---

## 解決に必要な技術スタック

- **Unity Editor 拡張 / C#**
  - GameObject、コンポーネント、enabled 状態を取得
- **TOML**
  - Unity の設定を管理しやすい構造化ファイル `SceneGraph.toml` として保存
- **TypeScript / Node.js**
  - ClusterScript API と `state` の変更を検出
- **制約ルール + CLI + Vitest**
  - API の必要コンポーネントを照合し、ローカルと CI で検証

<!--
話すこと: Unity固有の情報をTOMLに固定し、Node.js側の解析器が利用します。
目安: 25秒
-->

---

## 仕組み: シーンとコードを照合する

![w:1050](../assets/generated/repository-flow.svg)

- Exporter は Unity コンポーネントを TOML に変換
- Parser は `$.onGrab()` などの API 呼び出しを検出
- Validator は API ごとの必要コンポーネントを照合
- 不足・無効なコンポーネントを問題として報告

<!--
話すこと: TOMLがUnityとTypeScriptの境界です。両方の入力をValidatorへ集めます。
目安: 45秒
-->

---

## 現在できること

- Unity Package でシーン全体を出力、または選択範囲を更新
- Exporter の `SceneGraph.toml` と ClusterScript を CLI で解析し、ローカルや CI で検査
- スクリプトの割り当て先・階層も考慮し、Componentの不足・無効・対象不明などを根拠とともに報告
- API と Component の制約を検査
  - `setPosition` / `setRotation` → `MovableItem`
  - `onInteract` → Collider、`onGrab` / `onUse` → `GrabbableItem`
  - `onCollide` / `addForce` → `Rigidbody`
  - `getOverlaps` → `OverlapDetectorShape`
- `$.state` の直接変更や、Spawn Point / Despawn Height などワールドのアップロード要件も検査
- 不足が確定した場合は、修正計画を作成して対象・根拠・設定値を事前確認

<!--
話すこと: シーン構造とスクリプトの対応を含めて検査し、曖昧な対象や未検証の内容は確定扱いしません。
目安: 40秒
-->

---

## 解析からUnity上の修正・再確認まで

1. Exporter の `SceneGraph.toml` と ClusterScript を解析
2. 追加候補と対象 GameObject、根拠、必要な設定値を変更計画で確認
3. 利用者が内容を確認し、明示的に承認
4. VS Code の Copilot Agent mode と Unity CLI MCP で承認済みのComponent変更を適用
5. Exporter で再出力し、解析・変更結果を検証

> MCPは変更計画の承認を省略せず、曖昧な対象を自動選択しない

<!--
話すこと: 指摘から修正までをつなぎますが、何をどこに加えるかを人が確認してから変更します。
目安: 35秒
-->

---

## Unity CLI / MCP の役割と安全策

- Unity Editor のシーンやComponentを確認し、承認済み計画のComponent追加・明示された設定変更を実行
- GameObject は GlobalObjectId と階層パスで再確認し、一意に特定できない場合は停止
- 承認されていない計画、計画外の変更、推測が必要な設定は適用しない
- MCPの取得情報だけでは、Componentの完全修飾型名や有効状態をすべて得られない
- そのため **解析の正規入力は引き続きExporterの `SceneGraph.toml`**。MCPは編集と確認の補助
- 成功・失敗・未検証を区別して結果を報告

<!--
話すこと: MCPのシーン読み取りは便利ですが、Exporterと同じ情報をすべて取れるわけではありません。編集範囲も承認済み計画に限定します。
目安: 35秒
-->

---

## 今後の改善テーマ

- 対応するClusterScript API・Component制約の拡充
- より多様なTypeScript構文に対する解析精度の向上
- Unity CLI / Pipeline のバージョン差を含めた実環境での検証拡充
- SceneGraph形式、Exporter、Analyzer、MCP変更フローの互換性テスト強化

> 実行時の挙動を保証するものではなく、静的解析と承認済みの限定的なシーン変更を支援

---

## まとめ

- UnityシーンとClusterScriptの依存を、Exporter・CLI・CIで事前に確認
- 不足や対象の曖昧さを見える化し、修正候補を計画として提示
- Unity CLI / MCPで人が承認したComponent変更を適用し、Exporterで再検証
- 静的解析の範囲とMCPで取得できる情報には限界がある

<!--
話すこと: シーン設定とスクリプトをつないで、検出・承認・修正・確認を支援するツールです。
目安: 15秒
-->