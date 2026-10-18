# 説明資料

このフォルダは、リポジトリの説明資料を Marp で管理する独立した npm パッケージです。

## セットアップ

```bash
cd presentations
npm install
```

## 生成

```bash
npm run build
```

PDF は `dist/repository-overview.pdf` に出力されます。編集時のローカルプレビューは `slides/` 内のスライドをローカルサーバーで表示します。次を実行してください。

```bash
npm run preview
```

## 図

Mermaid のソースは `diagrams/` に置き、`npm run generate:diagrams` で SVG に変換します。各 `build:*` コマンドは、この変換を先に実行してからスライドへ SVG を埋め込みます。