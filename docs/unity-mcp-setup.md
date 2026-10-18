# Unity MCP 開発環境セットアップ（Windows / VS Code / GitHub Copilot）

Unity CLI に組み込まれた MCP サーバーを、VS Code の GitHub Copilot Agent mode から使うための手順書です。人間の開発者と AI エージェントの両方が、この文書だけで同じ環境を再現できることを目的にしています。調査結果と SceneGraph との対応は [unity-cli-mcp.md](unity-cli-mcp.md) を参照してください。

AI エージェント向けの作業手順は [.github/skills/unity-mcp-setup/SKILL.md](../.github/skills/unity-mcp-setup/SKILL.md) にあります。

## 検証済み環境

確認したランタイムとツールのバージョンは[クイックスタート](quickstart.md#必要なツールとバージョン)に集約しています。実機での確認内容は[Unity CLI MCP の調査記録](unity-cli-mcp.md)を参照してください。

Unity CLI は実験的機能です。コマンドや仕様が変わる可能性があるため、バージョンを上げる前に互換性を確認してください。Unity Pipeline 操作の対応バージョンは[クイックスタート](quickstart.md#必要なツールとバージョン)を参照してください。古い Unity プロジェクトは、CCK の互換性確認なしにアップグレードしないでください。

## VS Code 拡張機能

| 拡張機能 ID | 扱い | 備考 |
| --- | --- | --- |
| `GitHub.copilot-chat` | 同梱（導入不要） | Agent mode と MCP ツール呼び出しを提供する。確認した VS Code では `resources/app/extensions/copilot` に組み込まれており、`code --list-extensions` には表示されない。 |
| `vscode.github-authentication` | 同梱（導入不要） | GitHub サインイン用の認証プロバイダー。 |
| `GitHub.copilot` | 導入しない | 非推奨。チャットと Agent mode には不要。 |
| Unity MCP 専用の拡張機能 | 不要 | 接続はルートの `.mcp.json` だけで行う。 |

同梱の拡張機能 ID は、VS Code の `product.json` にある `defaultChatAgent.chatExtensionId` で確認できます。拡張機能を明示的に管理したい場合のために、`.vscode/extensions.json` の `recommendations` へ追加する案もありますが、現状では追加していません（`.vscode/` は Git の追跡対象にしていないため）。

専用のプロファイルは必須ではありません。既定プロファイルでも動作します。Copilot 関連の設定を分けたい場合だけ、VS Code の **Profiles: Create a Profile** で既定プロファイルをコピーして作成します。`code --profile "<名前>"` は、存在しない名前を指定すると空のプロファイルを新規作成するため、既存設定を引き継ぐ目的には使えません。

## 構成ファイル

Unity MCP の接続は、ルートの `.mcp.json` だけで定義し、コミットします。`mcpServers` を使うポータブル形式で、VS Code や Copilot CLI など対応クライアントが読み込みます。


### `.mcp.json`

```json
{
  "mcpServers": {
    "unity": {
      "type": "stdio",
      "command": "unity",
      "args": [
        "mcp",
        "--project-path",
        "packages/unity-semantic-graph/Samples~"
      ]
    }
  }
}
```

### 設定方針

- **ユーザー固有の値を書かない。** 絶対パス、ユーザー名、認証情報、API キーはコミットしない。`command` は `unity` とし、PATH から解決する。
- **対象プロジェクトを固定する。** `--project-path` に Unity プロジェクトのルート（`Assets/` と `ProjectSettings/` がある場所）を指定する。このリポジトリでは `packages/unity-semantic-graph/Samples~` を指す。
- **`.mcp.json` の相対パスは作業ディレクトリがリポジトリルートであることに依存する。** `unity mcp --project-path packages/unity-semantic-graph/Samples~` をリポジトリルートで実行すると解決できることを確認済み。他のクライアントで作業ディレクトリが異なる場合は、絶対パスに置き換えるのではなく、環境変数 `UNITY_PROJECT_PATH`（Unity CLI のリリースノートに記載）か、クライアント側の `cwd` 指定を使う。
- **`unity mcp configure` の出力は、そのままコミットしない。** `vscode` クライアント向けのコマンドは `.vscode/mcp.json` に絶対パスを書き込むため、この構成では実行しない。クライアントの対応状況の確認だけに使う。
  ```powershell
  unity mcp configure --list
  ```
  クライアント識別子（`vscode`、`vscode-insiders`、`copilot-cli` など）は CLI のバージョンで変わり得る。他のクライアントを追加する場合は、`--dry-run` で書き込み内容を確認し、絶対パスを含めない形に書き換えてからコミットする。

## セットアップ手順

### 1. Unity CLI を導入する

```powershell
winget install --id Unity.CLI --exact
```

ターミナルを開き直してから確認します。

```powershell
unity --version
unity mcp configure --list
```

必要な Unity CLI のバージョンは[クイックスタート](quickstart.md#必要なツールとバージョン)を参照してください。`unity --version` が要件を満たし、`--list` に VS Code / GitHub Copilot が表示されれば成功です。

### 2. Unity Editor を用意する

Unity Hub などで必要な Unity Editor をインストールします。確認したバージョンは[クイックスタート](quickstart.md#必要なツールとバージョン)を参照してください。`unity editors list --json` でインストール済みの Editor を確認できます。

### 3. Unity Pipeline package をプロジェクトへ導入する

```powershell
unity pipeline install --project-path packages/unity-semantic-graph/Samples~
```

このコマンドは `Samples~/Packages/manifest.json` に `com.unity.pipeline` を追加し、`packages-lock.json` を更新します。Unity Pipeline は実験的パッケージであり、必要なバージョンは[クイックスタート](quickstart.md#必要なツールとバージョン)を参照してください。サンプルプロジェクトの配布物を変えないため、**この 2 ファイルの変更はコミットしません**。作業開始前に2ファイルに差分がないことを確認できた場合は、Editorを閉じた後、次で作業後に元に戻します。

Unity MCPを使う作業では、AIエージェントが作業開始時にPipelineの有無を確認し、必要ならMCP呼び出しより前に導入して構いません。これはMCP利用時だけ必要な依存で、Exporter / analyzer の通常利用者には追加しない方針です。現在の実験的バージョンは[クイックスタート](quickstart.md#必要なツールとバージョン)を参照してください。

安定版になり対象Editorとの互換性が検証された後は、MCPを使う作業の前に事前導入して構いません。安定版になっただけでサンプルの必須依存やコミット対象にはしません。標準依存に昇格する場合は、CIまたは手動検証・対応バージョン・更新とロールバック条件を別途決定します（[ADR 0003](adr/0003-unity-pipeline-package-lifecycle.md)）。

作業開始前に2ファイルに既存差分がないことを確認してください。既存差分がある場合は、以下の `git restore` を実行してユーザーの変更を消さず、Pipeline導入分だけを安全に除去できなければ確認を求めます。

```powershell
git restore -- "packages/unity-semantic-graph/Samples~/Packages/manifest.json" "packages/unity-semantic-graph/Samples~/Packages/packages-lock.json"
```

Editor を閉じてから実行してください。

### 4. Editor を開いて Pipeline サーバーの起動を待つ

```powershell
unity open packages/unity-semantic-graph/Samples~
unity pipeline list --json
```

Unity アカウントにサインインしていない場合、Editor はアカウントなしで開きます。MCP の読み取りには影響しませんでした。初回のインポートとコンパイルには時間がかかります。`pipelineServer.isReachable` が `true`、`safeMode` が `null` または `false` になるまで待ちます。

### 5. VS Code で Copilot を使えるようにする

1. 必要なバージョンの VS Code でリポジトリのフォルダーを開き、ワークスペースを信頼する。バージョンは[クイックスタート](quickstart.md#必要なツールとバージョン)を参照。
2. GitHub アカウントで Copilot にサインインする（ステータスバーの Copilot アイコンから）。
3. `MCP: List Servers`（コマンドパレット）で `unity` が表示されることを確認する。初回の起動時は MCP サーバーを信頼する確認が出る。内容（`unity mcp --project-path ...`）を確認してから許可する。

## 動作確認

### レベル 1: CLI

```powershell
unity pipeline list --json
```

対象プロジェクトの `isRunning` と `pipelineServer.isReachable` が `true` であることを確認します。

### レベル 2: MCP プロトコル

リポジトリルートで、設定ファイルと同じ起動コマンドを使い、`initialize`、`tools/list`、読み取りツール 1 つを呼びます。Windows の既定コードページ（cp932）で文字化けしないよう、UTF-8 を明示します。

```powershell
@'
import json, queue, subprocess, threading, time
p = subprocess.Popen(["unity", "mcp", "--project-path", "packages/unity-semantic-graph/Samples~", "--no-banner"],
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                     text=True, encoding="utf-8", errors="replace", bufsize=1)
q = queue.Queue()
threading.Thread(target=lambda: [q.put(l) for l in p.stdout], daemon=True).start()
def send(x): p.stdin.write(json.dumps(x) + "\n"); p.stdin.flush()
def recv(i, t=60):
    end = time.time() + t
    while time.time() < end:
        try: m = json.loads(q.get(timeout=max(.1, end - time.time())))
        except queue.Empty: break
        if m.get("id") == i: return m
    raise TimeoutError(i)
send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "check", "version": "1"}}}); recv(1)
send({"jsonrpc": "2.0", "method": "notifications/initialized"})
send({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "list_open_scenes", "arguments": {}}})
print(json.dumps(recv(2)["result"], ensure_ascii=True))
p.stdin.close(); p.wait(timeout=10)
'@ | python -
```

`list_open_scenes` の結果に `Assets/test.unity` が含まれれば成功です。

### レベル 3: Copilot Agent mode

VS Code の Agent mode で、読み取り専用ツールだけを指定して呼びます。

```text
unity MCP の list_open_scenes を 1 回だけ呼び、開いているシーン名を答えてください。
変更系ツールは使わないでください。
```

コマンドラインからも同じ確認ができます。

```powershell
code chat --mode agent --reuse-window "unity MCP の list_open_scenes を1回だけ呼び、シーン名を答えてください。変更系ツールは使わないでください。"
```

呼び出しは、VS Code のログ `%APPDATA%\Code\logs\<セッション>\agenthost.log` で確認できます。成功時は次のように記録されます。

```text
MCP server 'unity' connected (ready)
Tool started: unity-list_open_scenes
```

## 安全に使うための方針

- Unity MCP は 160 のツールを公開し、`add_component`、`create_gameobject`、`delete_gameobject`、`set_component_properties`、`save_scene`、`eval`、`run_script`、`write_text_file`、`quit` など**変更系も含む**。どのツールにも `readOnlyHint` 等の読み取り専用注釈はない。接続できることは、安全であることを意味しない。
- 初期段階では、次の**読み取りツールだけ**を使う。実機で呼び出して確認済み: `list_open_scenes`、`get_scene_hierarchy`、`find_gameobjects`、`get_component_properties`、`get_serialized_fields`、`console_status`。
- プロンプトで「変更系ツールは使わない」と明記し、VS Code のツール実行の確認ダイアログで、内容を確認してから許可する。
- シーン変更は、修正計画の提示とユーザーの承認を経てからに限る（[開発計画](schema/issue.md) の方針）。
- MCP が使えなくても、既存の静的解析（`packages/ts-analyzer` の `npm run verify` と CLI）は独立して実行できる。

## 既知の問題とトラブルシューティング

| 症状 | 原因と対処 |
| --- | --- |
| `unity` が見つからない | 導入後にターミナルを開き直していない。PATH を再読み込みする。 |
| `unity pipeline list` に対象プロジェクトが出ない / `isReachable` が `false` | Editor が起動していない、またはインポート・コンパイル中。完了まで待つ。`safeMode` が有効な場合はコンパイルエラーを解消する。 |
| Agent mode のチャットで `unity` のツールが見えない | `.mcp.json` がルートにあるか確認する。Agent セッションは `.mcp.json` を読む。`agenthost.log` に `MCP server 'unity'` の行があるか確認する。Editor が起動していないと、サーバーは接続してもツールが見つからないことがある。 |
| ツール呼び出しが進まない | VS Code のチャットが、ツール実行の承認を待っている。`unity` のツールは読み取り専用と扱われず、毎回確認が出る。内容を確認して許可する。 |
| `Profile '<名前>' not found.` | `code --list-extensions --profile` は存在しないプロファイルを作らない。Profiles 画面で作成する。 |
| スクリプトで `UnicodeDecodeError: 'cp932'` | MCP の出力は UTF-8。`subprocess` に `encoding="utf-8"` を指定する。 |
| `unity mcp configure` が別のディレクトリに書き込もうとする | 書き込み先は作業ディレクトリ基準。対象リポジトリのルートに移動してから、`--dry-run` で確認する。 |
| `Samples~/Packages/manifest.json` に差分が出る | [ADR 0003](adr/0003-unity-pipeline-package-lifecycle.md) に従い、Pipeline導入による `manifest.json` / `packages-lock.json` の差分はコミットしない。作業前に既存差分がないことを確認し、作業後にPipeline導入分だけを復元する。 |
