# Unity CLI MCP 調査

## 方針

独自MCPサーバーは実装せず、Unity CLIに組み込まれたMCPサーバーをUnity Editor連携に利用する。Unityは従来のEditor内AI Assistantパッケージに含まれるMCPサーバーを非推奨とし、Unity CLIを後継として案内している。

`SceneGraph.toml` は、Unityプロジェクト（シーン）の構造をダンプした構造化ファイルであり、ClusterScriptの静的解析はこのファイルの構造を入力として行う。そのためMCP連携でもこの構造（[SceneGraph TOMLスキーマ](schema/scene-graph-toml.md)）に合わせて情報を扱い、MCPから同じ情報を取得できると確認できるまでは、GameObjectやComponentの識別子・プロパティを推測で補わない。

## 公式資料で確認できた条件

確認日: 2026-10-12

| 項目 | 確認内容 |
| --- | --- |
| CLIの状態 | Unity CLIは実験的な機能であり、コマンドやドキュメントが変更される可能性がある。 |
| Editor連携 | CLIは各Editorバージョンを管理できる。Unity Pipeline経由で起動中のEditorを操作するにはUnity 6.0 LTS以降が必要。 |
| MCP | CLIのMCPモードは非推奨対象ではなく、Unity Pipelineパッケージを基盤とする。MCPクライアントの設定には`unity mcp configure <client>`、対応クライアントと状態の確認には`unity mcp configure --list`を使う。 |
| Pipeline | UnityプロジェクトにUnity Pipelineパッケージと依存関係を導入し、Editorの再コンパイル後に導入状態を確認する。実際のコマンドは、使用するCLIの`unity --help`とPipelineの公式手順で確認する。 |
| ネットワーク | Editor制御用のローカルPipelineサーバーはlocalhostのみで接続を受け付ける。 |
| ライセンス | Unity CLIの利用にUnity AIサブスクリプションは不要。Unityアカウントへのサインインが必要な機能は、導入時にCLIの公式手順を確認する。 |

CLIのMCP機能は、Unity Editor内AI AssistantパッケージのMCPサーバーとは別の実装である。既存プロジェクトが古いAI Assistantパッケージを使う場合は、CLIとの競合条件もUnityの移行ガイドで確認する。

## 導入手順と設定方針

Windows / VS Code / GitHub Copilot での導入手順、`.mcp.json` の設定方針、VS Code 拡張機能の ID、動作確認、トラブルシューティングは [unity-mcp-setup.md](unity-mcp-setup.md) に記載する。AI エージェント向けの作業手順は [.github/skills/unity-mcp-setup/SKILL.md](../.github/skills/unity-mcp-setup/SKILL.md) にある。

## この環境での確認結果

確認日: 2026-10-12。接続の基本確認は、Session 用フォルダーに作成した Unity 6 の一時プロジェクト（後で削除済み）で行い、その後、リポジトリの `packages/unity-semantic-graph/Samples~`（Unity 6000.2.6f2、CCK 3.4.0、シーン `Assets/test.unity`）で、コミット済みの設定と同じ起動コマンドで再確認した。

| 項目 | 結果 |
| --- | --- |
| VS Code | 1.141.0。 |
| GitHub Copilot Chat | `GitHub.copilot-chat` 0.69.0 が VS Code に同梱されている。`code --list-extensions` には表示されない。`GitHub.copilot` は非推奨のため導入しない。 |
| Unity CLI | winget から 1.0.0-beta.13（package version 1.0.0.20013）を導入。MCP サーバーの `serverInfo.version` も 1.0.0-beta.13。 |
| Unity Editor | Hub 配下に 2021.3.4f1 と 6000.2.6f2。サンプルは 6000.2.6f2 で起動した。 |
| Unity Pipeline | `com.unity.pipeline` 0.8.0-exp.1 を導入。`unity pipeline list` で導入済み、ポート 7800、`127.0.0.1` のサーバー到達可能を確認。 |
| MCP 設定 | ルートの `.mcp.json` に `unity` を定義する（`command: "unity"`、相対パス）。`.vscode/mcp.json` は重複かつ非推奨のため置かない。 |
| MCP プロトコル | `initialize`、`tools/list`（160 ツール）に成功。`.mcp.json` の `command` と `args` と同じ起動コマンドで、実サンプルのシーン（`Assets/test.unity`、ルート 8、GameObject 18）を読み取った。 |
| Copilot Agent mode | `code chat --mode agent` の Agent セッションで確認した。`.vscode/mcp.json` だけの状態では `unity` が登録されず、エージェントは `unity mcp` を直接起動する回避策を取った。`.mcp.json` を追加すると `MCP server 'unity' connected (ready)` となり、`unity-list_open_scenes` が呼ばれ、シーン名 `test` を返した。`.vscode/mcp.json` を削除して `.mcp.json` のみにしても、`unity` は接続され、ツールが検出され、`unity-list_open_scenes` の実行要求まで進んだ（その回は VS Code 側のツール実行の承認待ちで止まり、結果の取得までは確認していない）。読み取りツールのみを呼んだ。 |
| 静的解析 | MCP と独立して実行できる。`packages/ts-analyzer` の `npm run verify`（4 files / 18 tests）が成功した。 |
| Unity アカウント | サインインしていない。Editor はアカウントなしで起動し、MCP の読み取りに影響しなかった。 |

専用の VS Code プロファイルは作成しなかった。既定プロファイルのまま動作する。

### 設定ファイルの扱い

`code chat --mode agent` が起動する Agent セッションは、VS Code の Agent Host 上の Copilot CLI ハーネスで動く。この環境では `.vscode/mcp.json` だけでは `unity` が登録されず、ルートの `.mcp.json` を追加したときに登録された。VS Code の公式資料も、Agent Host は `.vscode/mcp.json` を直接読まず、`.mcp.json` または `~/.copilot/mcp-config.json` を読むと説明し、`.vscode/mcp.json` を非推奨としている。

両ファイルは同じ定義の重複になるため、`.vscode/mcp.json` は削除し、`.mcp.json` に一本化した。

### Editor が起動していない場合

Editor を閉じた状態では、`unity` サーバーは `connected (ready)` になるが、チャットのツール検索で `unity-` のツールが見つからなかった。この挙動は `.vscode/mcp.json` の有無に関係なく同じだった。Editor が起動し、`unity pipeline list` で Pipeline サーバーに到達できる状態で使う。

## 読み取り機能と SceneGraph の対応

実サンプルのシーンで、`GlobalObjectId`、パス、型名を `Samples~/Assets/SceneGraph.toml`（`onGrab` と `onGrab/Cube`）と突き合わせた。

| SceneGraph | MCP から取得できる値 | 対応状況 |
| --- | --- | --- |
| GameObject `id` | `find_gameobjects` の `globalId` | **完全一致**。`GlobalObjectId_V1-2-4623955290552cb4fb2bccad9a61aa7c-1369298475-0`（`onGrab`）が TOML と同一。 |
| Component `id` | `get_component_properties` の `component.globalId` | **完全一致**。`Item` の `...-1369298480-0` が TOML と同一。 |
| GameObject `path` / `name` / `parent` | `get_scene_hierarchy` の `hierarchyPath`、`name`、入れ子構造 | 変換が必要。MCP は `/onGrab`、TOML は `onGrab`（先頭の `/` なし）。`parent` は階層から導出できる。 |
| Component `type` | `get_scene_hierarchy` の `components`、`get_component_properties` の `type` | **不一致**。MCP は短縮名（`Item`、`Rigidbody`）、TOML は完全修飾名（`ClusterVR.CreatorKit.Item.Implements.Item`、`UnityEngine.Rigidbody`）。 |
| Component `enabled` | — | **取得できない**。`get_component_properties` にも `get_serialized_fields` にも、Camera と CCK の `Item` で `enabled` / `m_Enabled` が含まれなかった。 |
| Component `properties` | `get_component_properties`、`get_serialized_fields` | キー名が異なる。MCP はシリアライズ名（`itemName`、`m_Mass`）、TOML は表示名風のキー（`Item_Name`）。LayerMask 等は `unsupported` や `<unsupported:...>` で返る。`get_serialized_fields` は `propertyType` を付けて型を区別できる。 |
| Scene | `list_open_scenes` | 取得できる。 |
| Console | `console_status` | コンパイル失敗の有無、エラー・警告件数を取得できる。 |

`find_gameobjects` の `type` フィルターは完全修飾名を受け付ける。`ClusterVR.CreatorKit.Item.Implements.Item` を指定すると、`get_scene_hierarchy` で `Item` を持つ 6 個の GameObject と同数（6 件）が返った。応答に完全修飾名は含まれないが、`find_gameobjects(type=<完全修飾名>, hierarchy_path=<対象>)` で、特定の GameObject が特定の型の Component を持つかを判定できる。

### 結論

- GlobalObjectId で TOML の GameObject / Component と直接結び付けられるため、同名オブジェクトの曖昧さは回避できる。
- 不足判定（要求された型のコンポーネントが対象に存在するか）は、`find_gameobjects` の完全修飾名フィルターで可能。
- **MCP の情報だけでは SceneGraph.toml を完全には再構成できない。** 完全修飾型名の列挙と `enabled` は取得できない。`enabled` を使う判定（無効化されたコンポーネントの検出）は、既存の Unity exporter（`SelectiveComponentTomlExporter`）が出力する TOML を引き続き使うか、独自の Editor 拡張で補う必要がある。
- MCP は初期段階では「TOML の補完・照合」に使い、TOML の代替にはしない。

## 変更系ツールの扱い

`tools/list` には、`add_component`、`create_gameobject`、`delete_gameobject`、`set_component_properties`、`save_scene`、`eval`、`run_script`、`write_text_file`、`quit` などの変更系ツールも含まれる。160 ツールのすべてで `readOnlyHint` 等の注釈が返らない。MCP に接続できても読み取り専用は保証されないため、初期段階では次の運用とする。

- プロンプトで読み取り専用ツールだけを使うよう指定し、ツール実行の確認ダイアログで内容を確認する。
- 実機で呼び出して確認した読み取りツールは `list_open_scenes`、`get_scene_hierarchy`、`find_gameobjects`、`get_component_properties`、`get_serialized_fields`、`console_status`。
- 変更系は、修正計画とユーザーの承認の後に限る。

## 未解決の事項

- `enabled` と完全修飾型名を取得する手段（`eval` による読み取り専用の式評価、Editor 拡張、既存 exporter の併用）の検討。`eval` は任意のコードを実行できるため、読み取り専用に制限できるかを先に調べる。
- ツール呼び出しの結果までを `.mcp.json` のみの構成で確認する。現状は、`unity-list_open_scenes` の実行要求が VS Code 側の承認待ちになっている。
- Prefab とシーンインスタンスの関係の取得方法。
- Unity Pipeline package の導入が `Samples~/Packages/manifest.json` を変更する点の扱い（現状はコミットしない運用）。

## 公式資料

- [Unity CLI as the replacement for the in-Editor MCP server](https://docs.unity.com/en-us/unity-cli/replace-mcp-server-unity-cli)
- [Unity Pipeline package](https://docs.unity.com/en-us/unity-cli/unity-pipeline/unity-pipeline-package)
- [Unity CLI documentation](https://docs.unity.com/en-us/unity-cli)
