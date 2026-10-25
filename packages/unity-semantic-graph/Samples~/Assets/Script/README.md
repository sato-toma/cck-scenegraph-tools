# Sample ClusterScript

このフォルダには Unity Semantic Graph の TypeScript サンプルがあります。ソースは `src/` に置き、ビルドすると JavaScript が `dist/` に生成されます。

```bash
npm ci
npm run build
```

生成された JavaScript は Git 管理対象外ですが、Unity シーンから参照するアセットの GUID を維持するため、`.js.meta` は Git 管理します。

## 型定義の更新

外部型定義を更新するには、次のコマンドを実行してください。

```bash
node scripts/update-types.js
```

TypeScript の依存バージョンは `package.json` で管理しています。
