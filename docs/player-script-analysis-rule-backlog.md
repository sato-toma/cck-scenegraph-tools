# PlayerScript 解析ルール追加候補一覧

この一覧では、PlayerScript API の解析ルールと検証状況を API 単位で管理する。

## 現在実装済み

| API | ルール | 検証 |
| --- | --- | --- |
| `_.setPosition` | `MovableItem` を必須としない | PlayerScript の fixture で位置・回転 API に Item 用のコンポーネント制約を誤適用しないことを確認 |
| `_.setRotation` | `MovableItem` を必須としない | PlayerScript の fixture で位置・回転 API に Item 用のコンポーネント制約を誤適用しないことを確認 |
| `_.worldItemReference` | 同じ Item GameObject に有効な `ClusterVR.CreatorKit.Item.Implements.WorldItemReferenceList` が必要 | `WorldItemReferenceList` の不足・無効・有効を fixture で確認 |

## 検証上の注意

- PlayerScript API は `_` receiver として解析し、Item のコンポーネント要件を流用しない。
- `_.setPosition` と `_.setRotation` に `MovableItem` を要求しないことを analyzer テストで確認する。
- `_.worldItemReference` は `WorldItemReferenceList` を要求する。リスト内 ID と参照先の照合は、現在の SceneGraph TOML に要素データが出力されないため対象外。
