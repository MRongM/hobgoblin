# README and GitHub Pages Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete multilingual README files and publish the existing `docs/` static site through GitHub Pages.

**Architecture:** Keep documentation as plain Markdown and a single static HTML page. Do not add a documentation framework, build pipeline, runtime code, or new dependencies. Use a dedicated GitHub Pages workflow to deploy `docs/`.

**Tech Stack:** Markdown, static HTML/CSS/vanilla JavaScript, GitHub Actions Pages actions.

**Repository Constraint:** Do not run `git commit` or create branches unless the user explicitly asks. This intentionally overrides the default commit cadence in the writing-plans skill.

---

## File Structure

- Modify `README.md`: English README and language switcher.
- Create `README.zh-CN.md`: Simplified Chinese README.
- Create `README.ko.md`: Korean README.
- Create `README.ja.md`: Japanese README.
- Modify `docs/index.html`: add installation navigation, section markup, section styles, localized strings, and correct repository links.
- Create `.github/workflows/pages.yml`: deploy `docs/` to GitHub Pages.

Use `https://github.com/MRongM/hobgoblin` as the repository URL because the local `origin` remote points to `git@github.com:MRongM/hobgoblin.git`.

---

### Task 1: Expand the English README

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Replace `README.md` with complete English documentation**

Use this full content:

````markdown
# Hobgoblin

English | [简体中文](README.zh-CN.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

Hobgoblin is a desktop workspace for Git branches and worktrees. It helps you open multiple repositories, understand branch state quickly, and take common Git actions without switching between terminals, editors, and browser tabs.

## Product Features

- **Multi-repository workspace:** Open repositories in tabs, reorder them, and restore your previous session.
- **Branch and worktree overview:** See branch status, worktree state, latest commits, and linked pull requests in one window.
- **Git actions in context:** Checkout, pull, push, create worktrees, open branches in external tools, and jump to GitHub.
- **Server-backed terminals:** Keep terminals attached to the workspace, including compact layouts for smaller screens.
- **Local and SSH repositories:** Work with local paths and remote repositories through SSH-focused flows.
- **Keyboard-first workflow:** Navigate branches, switch repositories, and trigger actions without leaving the keyboard.
- **Themes and languages:** Use light, dark, and themed presets with English, Simplified Chinese, Korean, and Japanese UI strings.

## Installation

Download the latest build from [GitHub Releases](https://github.com/MRongM/hobgoblin/releases).

Choose the artifact for your platform:

- **macOS Apple Silicon:** download the `arm64.dmg` file.
- **macOS Intel:** download the `x64.dmg` file.
- **Windows x64:** download the `.exe` installer.

The current builds are unsigned.

On macOS, Gatekeeper may block the app after download. If that happens, right-click the app, choose **Open**, and confirm. You can also remove the quarantine flag after installing:

```sh
xattr -dr com.apple.quarantine /Applications/Hobgoblin.app
```
````

On Windows, SmartScreen may warn about the unsigned installer. Continue only if you trust the GitHub Release source.

## Build and Install Locally

Requirements:

- Bun
- Node.js 24+

Build and install the desktop app on macOS:

```sh
bun run install:app
```

This builds a host-architecture `Hobgoblin.app` and installs it to `~/Applications`.

## Develop

Install dependencies and start the development app:

```sh
bun install
bun run dev
```

## Server Mode

Build the web UI and start server mode:

```sh
./serve.sh
```

Default URL:

```text
http://127.0.0.1:32200
```

Override the listen address when needed:

```sh
./serve.sh --host 127.0.0.1 --port 32200
```

## Links

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [Source Code](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)

## License

Hobgoblin is MIT-licensed.

````

- [ ] **Step 2: Verify required English sections exist**

Run:

```sh
rg -n "Product Features|Installation|Build and Install Locally|Develop|Server Mode|GitHub Pages" "README.md"
````

Expected: matches for every section name.

---

### Task 2: Add localized README files

**Files:**

- Create: `README.zh-CN.md`
- Create: `README.ko.md`
- Create: `README.ja.md`

- [ ] **Step 1: Create `README.zh-CN.md`**

Use this full content:

````markdown
# Hobgoblin

[English](README.md) | 简体中文 | [한국어](README.ko.md) | [日本語](README.ja.md)

Hobgoblin 是一个面向 Git 分支和 worktree 的桌面工作区。它可以同时打开多个仓库，快速理解分支状态，并在一个窗口里完成常见 Git 操作，减少在终端、编辑器和浏览器标签页之间来回切换。

## 产品特点

- **多仓库工作区：** 以标签页打开仓库，支持排序，并在下次启动时恢复会话。
- **分支与 worktree 纵览：** 在一个窗口里查看分支状态、worktree 状态、最新提交和关联 Pull Request。
- **上下文内 Git 操作：** 支持 checkout、pull、push、创建 worktree、在外部工具打开分支，以及跳转到 GitHub。
- **服务端托管终端：** 终端跟随工作区管理，并适配小屏幕紧凑布局。
- **本地与 SSH 仓库：** 支持本地路径，也支持面向 SSH 的远程仓库流程。
- **键盘优先：** 用键盘浏览分支、切换仓库和触发操作。
- **主题与语言：** 支持浅色、深色和主题预设，并提供英语、简体中文、韩文、日文界面文案。

## 安装步骤

从 [GitHub Releases](https://github.com/MRongM/hobgoblin/releases) 下载最新构建。

按平台选择文件：

- **macOS Apple Silicon：** 下载 `arm64.dmg` 文件。
- **macOS Intel：** 下载 `x64.dmg` 文件。
- **Windows x64：** 下载 `.exe` 安装程序。

当前构建未签名。

在 macOS 上，Gatekeeper 可能会阻止下载后的应用。如果出现这种情况，可以右键应用，选择 **打开**，然后确认。安装后也可以移除隔离标记：

```sh
xattr -dr com.apple.quarantine /Applications/Hobgoblin.app
```
````

在 Windows 上，SmartScreen 可能会对未签名安装程序发出警告。只有在信任该 GitHub Release 来源时才继续安装。

## 本地构建与安装

环境要求：

- Bun
- Node.js 24+

在 macOS 上构建并安装桌面应用：

```sh
bun run install:app
```

该命令会构建当前主机架构的 `Hobgoblin.app`，并安装到 `~/Applications`。

## 开发

安装依赖并启动开发应用：

```sh
bun install
bun run dev
```

## Server Mode

构建 Web UI 并启动 server mode：

```sh
./serve.sh
```

默认地址：

```text
http://127.0.0.1:32200
```

需要时可以覆盖监听地址：

```sh
./serve.sh --host 127.0.0.1 --port 32200
```

## 链接

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [源代码](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)

## 许可证

Hobgoblin 使用 MIT 许可证。

````

- [ ] **Step 2: Create `README.ko.md`**

Use this full content:

```markdown
# Hobgoblin

[English](README.md) | [简体中文](README.zh-CN.md) | 한국어 | [日本語](README.ja.md)

Hobgoblin은 Git 브랜치와 worktree를 위한 데스크톱 작업 공간입니다. 여러 리포지토리를 열고, 브랜치 상태를 빠르게 파악하며, 터미널과 에디터와 브라우저 탭을 오가지 않고도 일반적인 Git 작업을 한 창에서 수행할 수 있습니다.

## 제품 특징

- **멀티 리포지토리 작업 공간:** 리포지토리를 탭으로 열고, 순서를 바꾸고, 이전 세션을 복원합니다.
- **브랜치와 worktree 개요:** 브랜치 상태, worktree 상태, 최신 커밋, 연결된 Pull Request를 한 창에서 확인합니다.
- **문맥 안의 Git 작업:** checkout, pull, push, worktree 생성, 외부 도구에서 브랜치 열기, GitHub로 이동을 지원합니다.
- **서버 기반 터미널:** 터미널을 작업 공간에 연결하고 작은 화면을 위한 컴팩트 레이아웃을 제공합니다.
- **로컬 및 SSH 리포지토리:** 로컬 경로와 SSH 중심의 원격 리포지토리 흐름을 지원합니다.
- **키보드 우선 흐름:** 키보드로 브랜치를 탐색하고, 리포지토리를 전환하고, 작업을 실행합니다.
- **테마와 언어:** 라이트, 다크, 테마 프리셋과 영어, 중국어 간체, 한국어, 일본어 UI 문구를 제공합니다.

## 설치

[GitHub Releases](https://github.com/MRongM/hobgoblin/releases)에서 최신 빌드를 다운로드하세요.

플랫폼에 맞는 파일을 선택하세요:

- **macOS Apple Silicon:** `arm64.dmg` 파일을 다운로드합니다.
- **macOS Intel:** `x64.dmg` 파일을 다운로드합니다.
- **Windows x64:** `.exe` 설치 파일을 다운로드합니다.

현재 빌드는 서명되지 않았습니다.

macOS에서는 Gatekeeper가 다운로드한 앱을 차단할 수 있습니다. 이 경우 앱을 오른쪽 클릭하고 **열기**를 선택한 뒤 확인하세요. 설치 후 격리 플래그를 제거할 수도 있습니다:

```sh
xattr -dr com.apple.quarantine /Applications/Hobgoblin.app
````

Windows에서는 SmartScreen이 서명되지 않은 설치 파일에 대해 경고할 수 있습니다. GitHub Release 출처를 신뢰하는 경우에만 계속하세요.

## 로컬 빌드 및 설치

요구 사항:

- Bun
- Node.js 24+

macOS에서 데스크톱 앱을 빌드하고 설치합니다:

```sh
bun run install:app
```

이 명령은 현재 호스트 아키텍처의 `Hobgoblin.app`을 빌드하고 `~/Applications`에 설치합니다.

## 개발

의존성을 설치하고 개발 앱을 시작합니다:

```sh
bun install
bun run dev
```

## Server Mode

Web UI를 빌드하고 server mode를 시작합니다:

```sh
./serve.sh
```

기본 URL:

```text
http://127.0.0.1:32200
```

필요하면 수신 주소를 바꿀 수 있습니다:

```sh
./serve.sh --host 127.0.0.1 --port 32200
```

## 링크

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [소스 코드](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)

## 라이선스

Hobgoblin은 MIT 라이선스를 사용합니다.

````

- [ ] **Step 3: Create `README.ja.md`**

Use this full content:

```markdown
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
````

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

````

- [ ] **Step 4: Verify localized README sections and links**

Run:

```sh
rg -n "MRongM/hobgoblin|README.zh-CN.md|README.ko.md|README.ja.md|Installation|安装步骤|설치|インストール" "README.md" "README.zh-CN.md" "README.ko.md" "README.ja.md"
````

Expected: all four files produce matches.

---

### Task 3: Add the installation section to GitHub Pages

**Files:**

- Modify: `docs/index.html`

- [ ] **Step 1: Update repository URLs in `docs/index.html`**

Replace all current source and release links:

```text
https://github.com/nano-props/goblin
https://github.com/nano-props/goblin/releases
https://github.com/nano-props
```

with:

```text
https://github.com/MRongM/hobgoblin
https://github.com/MRongM/hobgoblin/releases
https://github.com/MRongM
```

If the footer still displays `nano`, change that visible text to `MRongM`.

- [ ] **Step 2: Add an Install navigation link**

In the `.nav-links` block, add the install link between Features and How It Works:

```html
<a href="#features" data-i18n="nav_features">Features</a>
<a href="#install" data-i18n="nav_install">Install</a>
<a href="#how-it-works" data-i18n="nav_how">How It Works</a>
```

- [ ] **Step 3: Add installation section styles**

In the page `<style>` block after the feature card styles, add:

```css
/* INSTALL */
.install-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.install-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
}

.install-card h3 {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 8px;
}

.install-card p {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.install-code {
  background: var(--text);
  color: var(--bg);
  border-radius: 12px;
  padding: 18px 20px;
  overflow-x: auto;
  font:
    600 13px/1.7 ui-monospace,
    'SF Mono',
    Menlo,
    monospace;
}

.install-note {
  margin-top: 20px;
  color: var(--text-secondary);
  font-size: 14px;
}
```

- [ ] **Step 4: Add the install section markup**

Place this section after `</section>` for `id="features"` and before the current `<!-- HOW IT WORKS -->` comment:

```html
<!-- INSTALL -->
<section id="install">
  <div class="container">
    <div class="section-label" data-i18n="install_label">Install</div>
    <h2 class="section-title" data-i18n-html="install_title">Choose the build<br />for your machine</h2>
    <p class="section-desc" data-i18n="install_desc">
      Download Hobgoblin from GitHub Releases, or run it from source with Bun during development.
    </p>
    <div class="install-grid">
      <div class="install-card fade-in">
        <h3 data-i18n="install_macos_arm_title">macOS Apple Silicon</h3>
        <p data-i18n="install_macos_arm_desc">Download the arm64 DMG from the latest GitHub Release.</p>
      </div>
      <div class="install-card fade-in">
        <h3 data-i18n="install_macos_intel_title">macOS Intel</h3>
        <p data-i18n="install_macos_intel_desc">Download the x64 DMG from the latest GitHub Release.</p>
      </div>
      <div class="install-card fade-in">
        <h3 data-i18n="install_windows_title">Windows x64</h3>
        <p data-i18n="install_windows_desc">Download the Windows x64 installer from the latest GitHub Release.</p>
      </div>
      <div class="install-card fade-in">
        <h3 data-i18n="install_source_title">Develop from source</h3>
        <p data-i18n="install_source_desc">Install dependencies with Bun and start the development app locally.</p>
      </div>
    </div>
    <pre class="install-code"><code>bun install
bun run dev</code></pre>
    <p class="install-note" data-i18n="install_note">
      Current release builds are unsigned. macOS Gatekeeper or Windows SmartScreen may show a warning.
    </p>
    <div class="hero-actions" style="margin-top: 28px">
      <a
        href="https://github.com/MRongM/hobgoblin/releases"
        class="btn btn-primary"
        target="_blank"
        rel="noopener noreferrer"
      >
        <span data-i18n="btn_download">Download</span>
      </a>
      <a href="https://github.com/MRongM/hobgoblin" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">
        <span data-i18n="btn_source">Source Code</span>
      </a>
    </div>
  </div>
</section>
```

- [ ] **Step 5: Add English i18n strings**

In `i18n.en`, add these keys near the existing nav/features/how keys:

```js
          nav_install: 'Install',
          install_label: 'Install',
          install_title: 'Choose the build<br/>for your machine',
          install_desc: 'Download Hobgoblin from GitHub Releases, or run it from source with Bun during development.',
          install_macos_arm_title: 'macOS Apple Silicon',
          install_macos_arm_desc: 'Download the arm64 DMG from the latest GitHub Release.',
          install_macos_intel_title: 'macOS Intel',
          install_macos_intel_desc: 'Download the x64 DMG from the latest GitHub Release.',
          install_windows_title: 'Windows x64',
          install_windows_desc: 'Download the Windows x64 installer from the latest GitHub Release.',
          install_source_title: 'Develop from source',
          install_source_desc: 'Install dependencies with Bun and start the development app locally.',
          install_note: 'Current release builds are unsigned. macOS Gatekeeper or Windows SmartScreen may show a warning.',
```

- [ ] **Step 6: Add Simplified Chinese i18n strings**

In `i18n.zh`, add:

```js
          nav_install: '安装',
          install_label: '安装',
          install_title: '选择适合你设备的<br/>构建版本',
          install_desc: '从 GitHub Releases 下载 Hobgoblin，或在开发时使用 Bun 从源码运行。',
          install_macos_arm_title: 'macOS Apple Silicon',
          install_macos_arm_desc: '从最新 GitHub Release 下载 arm64 DMG。',
          install_macos_intel_title: 'macOS Intel',
          install_macos_intel_desc: '从最新 GitHub Release 下载 x64 DMG。',
          install_windows_title: 'Windows x64',
          install_windows_desc: '从最新 GitHub Release 下载 Windows x64 安装程序。',
          install_source_title: '从源码开发',
          install_source_desc: '使用 Bun 安装依赖，并在本地启动开发应用。',
          install_note: '当前发布构建未签名。macOS Gatekeeper 或 Windows SmartScreen 可能会显示警告。',
```

- [ ] **Step 7: Add Korean i18n strings**

In `i18n.ko`, add:

```js
          nav_install: '설치',
          install_label: '설치',
          install_title: '내 환경에 맞는<br/>빌드 선택',
          install_desc: 'GitHub Releases에서 Hobgoblin을 다운로드하거나 개발 중에는 Bun으로 소스에서 실행하세요.',
          install_macos_arm_title: 'macOS Apple Silicon',
          install_macos_arm_desc: '최신 GitHub Release에서 arm64 DMG를 다운로드하세요.',
          install_macos_intel_title: 'macOS Intel',
          install_macos_intel_desc: '최신 GitHub Release에서 x64 DMG를 다운로드하세요.',
          install_windows_title: 'Windows x64',
          install_windows_desc: '최신 GitHub Release에서 Windows x64 설치 파일을 다운로드하세요.',
          install_source_title: '소스에서 개발',
          install_source_desc: 'Bun으로 의존성을 설치하고 로컬 개발 앱을 시작하세요.',
          install_note: '현재 릴리스 빌드는 서명되지 않았습니다. macOS Gatekeeper 또는 Windows SmartScreen이 경고를 표시할 수 있습니다.',
```

- [ ] **Step 8: Add Japanese i18n strings**

In `i18n.ja`, add:

```js
          nav_install: 'インストール',
          install_label: 'インストール',
          install_title: '環境に合うビルドを<br/>選択',
          install_desc: 'GitHub Releases から Hobgoblin をダウンロードするか、開発時は Bun でソースから実行します。',
          install_macos_arm_title: 'macOS Apple Silicon',
          install_macos_arm_desc: '最新の GitHub Release から arm64 DMG をダウンロードしてください。',
          install_macos_intel_title: 'macOS Intel',
          install_macos_intel_desc: '最新の GitHub Release から x64 DMG をダウンロードしてください。',
          install_windows_title: 'Windows x64',
          install_windows_desc: '最新の GitHub Release から Windows x64 インストーラーをダウンロードしてください。',
          install_source_title: 'ソースから開発',
          install_source_desc: 'Bun で依存関係をインストールし、ローカルで開発アプリを起動します。',
          install_note: '現在のリリースビルドは未署名です。macOS Gatekeeper または Windows SmartScreen が警告を表示する場合があります。',
```

- [ ] **Step 9: Verify page keys and links**

Run:

```sh
rg -n "nav_install|install_label|install_macos_arm_title|MRongM/hobgoblin|nano-props/goblin" "docs/index.html"
```

Expected:

- Matches for `nav_install`, `install_label`, `install_macos_arm_title`, and `MRongM/hobgoblin`.
- No matches for `nano-props/goblin`.

---

### Task 4: Add GitHub Pages deployment workflow

**Files:**

- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Create `.github/workflows/pages.yml`**

Use this full content:

```yaml
name: Pages

on:
  workflow_dispatch:
  push:
    branches:
      - main
    paths:
      - docs/**
      - .github/workflows/pages.yml

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    name: Deploy GitHub Pages
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: docs

      - name: Deploy Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify workflow syntax-relevant strings**

Run:

```sh
rg -n "actions/configure-pages@v5|actions/upload-pages-artifact@v4|actions/deploy-pages@v4|pages: write|id-token: write|path: docs" ".github/workflows/pages.yml"
```

Expected: matches for every searched workflow requirement.

---

### Task 5: Verify documentation change

**Files:**

- Verify: `README.md`
- Verify: `README.zh-CN.md`
- Verify: `README.ko.md`
- Verify: `README.ja.md`
- Verify: `docs/index.html`
- Verify: `.github/workflows/pages.yml`

- [ ] **Step 1: Confirm no stale repository links remain in public docs**

Run:

```sh
rg -n "nano-props/goblin|github.com/nano-props" "README.md" "README.zh-CN.md" "README.ko.md" "README.ja.md" "docs/index.html"
```

Expected: no matches.

- [ ] **Step 2: Confirm all README files include installation and development guidance**

Run:

```sh
rg -n "bun install|bun run dev|arm64\\.dmg|x64\\.dmg|\\.exe" "README.md" "README.zh-CN.md" "README.ko.md" "README.ja.md"
```

Expected: all four README files produce matches.

- [ ] **Step 3: Confirm GitHub Pages install strings are wired for all languages**

Run:

```sh
rg -n "install_note|install_source_desc|install_windows_desc" "docs/index.html"
```

Expected: four matches for each key, one in each language dictionary.

- [ ] **Step 4: Run formatting check**

Run:

```sh
bun run format:check
```

Expected: PASS. If it fails only because files need formatting, run:

```sh
bun run format
```

Then re-run:

```sh
bun run format:check
```

- [ ] **Step 5: Manually inspect `docs/index.html`**

Open `docs/index.html` locally and verify:

- The `Install` navigation link scrolls to the installation section.
- The installation cards are readable on desktop and mobile widths.
- Language switching updates install copy for English, Simplified Chinese, Korean, and Japanese.
- Download buttons open `https://github.com/MRongM/hobgoblin/releases`.

- [ ] **Step 6: Review final working tree**

Run:

```sh
git status --short
```

Expected changed files:

```text
 M README.md
 M docs/index.html
?? .github/workflows/pages.yml
?? README.zh-CN.md
?? README.ko.md
?? README.ja.md
```

The existing spec and plan documents may also appear if they have not been committed by the user.
