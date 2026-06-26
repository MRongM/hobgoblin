# Hobgoblin

[English](README.md) | [简体中文](README.zh-CN.md) | [한국어](README.ko.md) | 日本語

Hobgoblin は Git ブランチと worktree のためのデスクトップワークスペースです。複数のリポジトリを開き、ブランチ状態をすばやく把握し、ターミナル、エディタ、ブラウザタブを行き来せずに一般的な Git 操作を一つの画面で実行できます。

## 製品の特徴

- **マルチリポジトリワークスペース:** リポジトリをタブで開き、並べ替え、前回のセッションを復元します。
- **ブランチと worktree の概要:** ブランチ状態、worktree 状態、最新コミット、リンクされた Pull Request を一つの画面で確認できます。
- **文脈内の Git 操作:** checkout、pull、push、worktree 作成、外部ツールでブランチを開く、GitHub への移動をサポートします。
- **サーバー管理のターミナル:** ターミナルをワークスペースに紐づけ、小さな画面向けのコンパクトレイアウトも提供します。
- **ローカルと SSH リポジトリ:** ローカルパスと SSH 中心のリモートリポジトリフローを扱えます。
- **キーボード優先:** キーボードでブランチ移動、リポジトリ切り替え、操作実行ができます。
- **テーマと言語:** ライト、ダーク、テーマプリセットに加え、英語、簡体字中国語、韓国語、日本語の UI 文言を提供します。

## インストール

[GitHub Releases](https://github.com/MRongM/hobgoblin/releases) から最新ビルドをダウンロードしてください。

プラットフォームに合ったファイルを選びます:

- **macOS Apple Silicon:** `arm64.dmg` ファイルをダウンロードします。
- **macOS Intel:** `x64.dmg` ファイルをダウンロードします。
- **Windows x64:** `.exe` インストーラーをダウンロードします。

現在のビルドは未署名です。

macOS では、Gatekeeper がダウンロード後のアプリをブロックする場合があります。その場合はアプリを右クリックして **開く** を選び、確認してください。インストール後に quarantine フラグを削除することもできます:

```sh
xattr -dr com.apple.quarantine /Applications/Hobgoblin.app
```

Windows では、SmartScreen が未署名インストーラーに警告を出す場合があります。GitHub Release の配布元を信頼できる場合のみ続行してください。

## ローカルビルドとインストール

要件:

- Bun
- Node.js 24+

macOS でデスクトップアプリをビルドしてインストールします:

```sh
bun run install:app
```

このコマンドはホストアーキテクチャ向けの `Hobgoblin.app` をビルドし、`~/Applications` にインストールします。

## 開発

依存関係をインストールし、開発アプリを起動します:

```sh
bun install
bun run dev
```

## Server Mode

Web UI をビルドし、server mode を起動します:

```sh
./serve.sh
```

デフォルト URL:

```text
http://127.0.0.1:32200
```

必要に応じて待ち受けアドレスを変更できます:

```sh
./serve.sh --host 127.0.0.1 --port 32200
```

## リンク

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [ソースコード](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)

## ライセンス

Hobgoblin は MIT ライセンスです。
