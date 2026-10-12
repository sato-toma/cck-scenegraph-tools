# ClusterScript 静的解析エンジン - 実装ガイド

## 概要

このプロジェクトは、**ClusterScript TypeScript コード**と**Unity シーン構造**を組み合わせて、**コンポーネント制約違反を検出する静的解析システム**です。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                  ClusterScriptAnalyzer                      │
│  (統合解析エンジン)                                          │
└──┬──────────────────────────────────────────────────────┬───┘
   │                                                      │
   ├─→ SceneGraphParser ←─ SceneGraph.toml              │
   │   (TOML解析・GameObject構造)                        │
   │                                                      │
   ├─→ TypeScriptCodeParser ←─ *.ts ファイル           │
   │   (API コール検出)                                  │
   │                                                      │
   └─→ ConstraintValidator ←─ ClusterScriptDefinitions │
       (制約検証)                (API制約定義)

       ↓

   AnalysisResult (エラー・警告を出力)
```

## モジュール構成

### 1. types.ts
**型定義とインターフェース**

- `SceneGraph`: TOML解析結果を保持
- `GameObject`: ゲームオブジェクト定義
- `Component`: コンポーネント情報
- `ComponentConstraint`: API制約定義
- `AnalysisResult`: 解析結果
- `ValidationIssue`: 検出された問題

### 2. sceneGraphParser.ts
**SceneGraph.toml の解析**

```typescript
// TOML ファイルをパース
const sceneGraph = SceneGraphParser.parseFile("SceneGraph.toml");

// GameObjectを検索
const gameObject = SceneGraphParser.getGameObjectById(sceneGraph, id);
const objects = SceneGraphParser.getGameObjectsByPath(sceneGraph, "/.*Floor.*/");

// コンポーネント分析
const withRigidbody = SceneGraphParser.getGameObjectsWithComponent(
  sceneGraph,
  "UnityEngine.Rigidbody"
);

// 構造の可視化
console.log(SceneGraphParser.visualizeHierarchy(sceneGraph));
```

主な機能：
- TOML ファイル解析
- GameObject/Component 検索
- 構造の可視化
- コンポーネント統計

### 3. clusterScriptDefinitions.ts
**ClusterScript API と制約定義**

ルール定義は [src/rules](src/rules) 配下に分離されており、以下のようにカテゴリ単位で管理しています。

- [src/rules/physics.ts](src/rules/physics.ts) - Rigidbody などの物理系ルール
- [src/rules/interactions.ts](src/rules/interactions.ts) - GrabbableItem / RidableItem などのインタラクション系ルール
- [src/rules/movement.ts](src/rules/movement.ts) - MovableItem などの移動系ルール
- [src/rules/stateMutation.ts](src/rules/stateMutation.ts) - `$.state.*` の直接変更を検出するルール

```typescript
// メソッドの制約を取得
const constraints = ClusterScriptDefinitions.getMethodConstraints("addForce");
// Output: [{ componentType: "UnityEngine.Rigidbody", requirement: "required" }]

// 利用可能な全 API
const methods = ClusterScriptDefinitions.getAllMethodNames();
```

主なメソッドとその制約：

| メソッド | 必須コンポーネント | 説明 |
|---------|-------------------|------|
| `addForce()` | UnityEngine.Rigidbody | 力を加える |
| `addImpulsiveForce()` | UnityEngine.Rigidbody | 撃力を加える |
| `onGrab()` | GrabbableItem | 掴まれた時 |
| `onRide()` | RidableItem | 乗られた時 |
| `onCollide()` | Rigidbody + Collider | 衝突時 |

### 4. constraintValidator.ts
**制約検証エンジン**

```typescript
// GameObject が制約を満たしているか検証
const validation = ConstraintValidator.validateGameObject(gameObject, constraints);
if (!validation.isValid) {
  console.log("Missing:", validation.missingRequired);
  console.log("Forbidden:", validation.extraForbidden);
}

// メソッド使用可能性を検証
const { canUse, missingComponents } =
  ConstraintValidator.canUseMethod(gameObject, "addForce");

// 複数メソッドを一括検証
const results = ConstraintValidator.batchValidateMethods(
  gameObject,
  ["addForce", "addTorque", "onCollide"]
);
```

主な機能：
- コンポーネント制約検証
- メソッド/プロパティアクセス可能性チェック
- 互換性チェック
- 一括検証

### 5. typeScriptParser.ts
**TypeScript コード解析**

このモジュールでは、正規表現ベースで以下を抽出します。

- API コール
- `$.state.*` への直接変更パターン
- `$.state.profile.name = ...` のようなネストした更新

特に state の変更については、再代入が必要なケースを検出してエラーとして報告します。

```typescript
// API コールを抽出
const apiCalls = TypeScriptCodeParser.extractApiCalls("script.ts");
// [
//   { line: 10, column: 5, methodName: "addForce", receiver: "$", ... },
//   { line: 20, column: 8, methodName: "onCollide", receiver: "$", ... },
// ]

// getUnityComponent コールを検出
const componentCalls = TypeScriptCodeParser.extractGetUnityComponentCalls(code);

// 関数定義を抽出
const functions = TypeScriptCodeParser.extractFunctionDefinitions(code);

// コード複雑度を計算
const complexity = TypeScriptCodeParser.calculateCodeComplexity(code);
```

主な機能：
- 正規表現ベースの API コール検出
- コンポーネント参照の検出
- 関数定義の抽出
- コード複雑度計算

**注**: 完全な AST 解析ではないため、複雑なケースでは TypeScript Compiler API の使用を推奨します。

### 6. analyzer.ts
**統合解析エンジン**

解析結果には、通常のコンポーネント制約違反に加えて、`INVALID_STATE_MUTATION` というコードで state の直接変更違反も含めます。これにより、ClusterScript の仕様に沿った書き方を静的に検出できます。

```typescript
const analyzer = new ClusterScriptAnalyzer("SceneGraph.toml");

// ファイルを解析
const result = analyzer.analyzeTypeScriptFile("script.ts");

// レポート生成
console.log(analyzer.generateReport(new Map().set("script.ts", result)));

// API カバレッジ
console.log(analyzer.generateApiCoverageReport("script.ts"));

// 推奨コンポーネント
console.log(analyzer.generateRecommendedComponents("script.ts"));
```

### 7. cli.ts
**コマンドラインインターフェース**

```bash
ts-analyzer analyze ./SceneGraph.toml ./script.ts
ts-analyzer report ./SceneGraph.toml ./script.ts
ts-analyzer coverage ./SceneGraph.toml ./script.ts
ts-analyzer recommend ./SceneGraph.toml ./script.ts
ts-analyzer scene-graph ./SceneGraph.toml
ts-analyzer list-apis
```

## 使用フロー

### 基本フロー

```
1. SceneGraph.toml を読み込み
   ↓
2. TypeScript ファイルのAPIコールを抽出
   ↓
3. 各APIコールについて、必須コンポーネントを確認
   ↓
4. GameObject が制約を満たしているか検証
   ↓
5. 問題を報告
```

### 実装例

```typescript
import {
  ClusterScriptAnalyzer,
  SceneGraphParser,
  ConstraintValidator,
  ClusterScriptDefinitions
} from "ts-analyzer";

// 1. アナライザーを初期化
const analyzer = new ClusterScriptAnalyzer("SceneGraph.toml");
const sceneGraph = analyzer.getSceneGraph();

// 2. 最初のGameObjectを取得
const gameObject = sceneGraph.gameObjects[0];

// 3. 特定のメソッドが使用可能か確認
const { canUse, missingComponents } =
  ConstraintValidator.canUseMethod(gameObject, "addForce");

if (!canUse) {
  console.error(`Cannot use addForce. Missing: ${missingComponents}`);
}

// 4. 推奨コンポーネントを取得
const allMethods = ClusterScriptDefinitions.getAllMethodNames();
const allConstraints = allMethods.flatMap(
  m => ClusterScriptDefinitions.getMethodConstraints(m)
);
```

## 制約の定義

### ComponentConstraint

```typescript
interface ComponentConstraint {
  componentType: string;        // Unity コンポーネント型
  requirement: "required" | "optional" | "forbidden";
  properties?: {
    [key: string]: {
      type: string;
      value?: any;
      values?: any[];
    };
  };
}
```

### 例

```typescript
{
  componentType: "UnityEngine.Rigidbody",
  requirement: "required",
  properties: {
    "Mass": { type: "float", value: 1.0 }
  }
}
```

## 解析結果

### AnalysisResult 構造

```typescript
{
  filePath: "script.ts",
  issues: [
    {
      line: 45,
      column: 10,
      severity: "error",
      code: "MISSING_COMPONENT",
      message: "Method 'addForce' requires components: UnityEngine.Rigidbody",
      apiCall: "addForce",
      requiredComponents: ["UnityEngine.Rigidbody"],
      availableComponents: ["UnityEngine.MeshFilter"]
    }
  ],
  componentRequests: [
    {
      id: "cr-<stable-hash>",
      api: "$.addForce",
      componentTypes: ["UnityEngine.Rigidbody"],
      componentMatch: "all",
      target: {
        kind: "current-scriptable-item",
        resolution: "unresolved"
      },
      verificationStatus: "unverified",
      validation: {
        presentComponentTypes: [],
        missingComponentTypes: [],
        matchedComponents: []
      },
      occurrences: [
        {
          source: { filePath: "script.ts", line: 45, column: 10 },
          condition: { kind: "unconditional" },
          evidence: "ClusterScript API constraint for $.addForce",
          confidence: "high"
        }
      ]
    }
  ],
  summary: {
    totalIssues: 1,
    errorCount: 1,
    warningCount: 0
  }
}
```

`ComponentRequirementRequest` は要求内容を表すデータで、判定器そのものではありません。解析時には `ComponentRequirementValidator` が `Source_Code_Asset` から対象 GameObject を解決し、`ConstraintValidator` を使って SceneGraph の Component と照合します。結果は `satisfied`、`missing`、`ambiguous`、`unsupported`、`unverified` のいずれかで、`verificationReason` が付く場合は判定できない理由を示します。`matchedComponents` には照合に使った SceneGraph 上の GameObject ID / path と Component 型が含まれます。

`$.getUnityComponent("UnityEngine.Rigidbody")` のようなリテラル参照は対象型を抽出しますが、それだけではスクリプトがその Component を必須としているとは限らないため `unverified` とします。required 制約が定義された API 呼び出しだけを SceneGraph 上の必須 Component として判定します。

照合結果は `componentRequests` から取得できます。既存の `issues`、レポート形式、終了コードは維持します。Unity CLI MCP からのシーン取得はこのローカル SceneGraph 照合とは別の後続フェーズです。

## パフォーマンス考慮事項

1. **TOML 解析**: 大規模シーン（>10000 GameObjects）では時間がかかる可能性
2. **正規表現**: 非常に大きなファイル（>100KB）では遅延の可能性
3. **メモリ**: すべてのGameObjectをメモリに保持

最適化方法：
- キャッシング機構の実装
- インクリメンタル解析
- 並列処理

## 拡張方法

### カスタムAPI制約を追加

```typescript
// clusterScriptDefinitions.ts を拡張
methods.set("customMethod", {
  name: "customMethod",
  requiredComponents: [
    {
      componentType: "MyCustomComponent",
      requirement: "required",
    },
  ],
  description: "Custom method description",
});
```

### カスタム検証ルールを追加

```typescript
class CustomValidator extends ConstraintValidator {
  static validateCustomRule(gameObject: GameObject): boolean {
    // カスタムルール実装
  }
}
```

### TypeScript Compiler API を使用した正確な解析

```typescript
import * as ts from "typescript";

function analyzeWithCompiler(filePath: string) {
  const program = ts.createProgram([filePath], {});
  const sourceFile = program.getSourceFile(filePath)!;

  // AST 走査
  ts.forEachChild(sourceFile, visit);
}
```

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|-------|
| TOML パースエラー | SceneGraph.toml のフォーマットが無効 | TOML 形式を確認 |
| コンポーネント未検出 | 正規表現が複雑なコードに未対応 | TypeScript Compiler API の使用を検討 |
| 偽陽性/偽陰性 | 条件分岐内のAPI呼び出しを追跡できない | より詳細なコード解析が必要 |

## 今後の改善案

1. **TypeScript Compiler API統合** - より正確な AST 解析
2. **IDE プラグイン** - VSCode/JetBrains IDE との統合
3. **JSON 出力形式** - CI/CD パイプラインとの連携
4. **キャッシング** - 解析速度の改善
5. **カスタムルール定義言語** - 柔軟な制約ルール設定
6. **可視化ツール** - 依存関係グラフの可視化

## ライセンス

MIT

## 参考資料

- [ClusterScript リファレンス](https://docs.cluster.mu/script/interfaces/ClusterScript.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TOML 仕様](https://toml.io/)
