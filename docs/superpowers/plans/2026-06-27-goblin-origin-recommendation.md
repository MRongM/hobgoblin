# Goblin Origin Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multilingual origin recommendation for Goblin to Hobgoblin's README files and GitHub Pages homepage.

**Architecture:** Keep this as a docs-only change. Add one short origin section to each README locale, and one static recommendation section to `docs/index.html` using the existing inline CSS and `i18n` language-switching model.

**Tech Stack:** Markdown, static HTML/CSS, vanilla JavaScript `i18n` dictionary.

**Repository Constraint:** Do not run `git commit`, create branches, or touch unrelated modified files unless the user explicitly asks.

---

## File Structure

- Modify `README.md`: add English `Origins` section.
- Modify `README.zh-CN.md`: add Simplified Chinese `起源` section.
- Modify `README.ko.md`: add Korean `기원` section.
- Modify `README.ja.md`: add Japanese `起源` section.
- Modify `docs/index.html`: add origin section markup, scoped styles, and localized strings for English, Simplified Chinese, Korean, and Japanese.

No new files, dependencies, images, workflows, or source-code modules are required.

---

### Task 1: Add Origin Sections To README Locales

**Files:**

- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `README.ko.md`
- Modify: `README.ja.md`

- [ ] **Step 1: Insert the English README section**

In `README.md`, insert this section after the productivity formula explanation and before `## Product Features`:

```markdown
## Origins

Hobgoblin started from [Goblin](https://nano-props.github.io/goblin/), a small, focused macOS desktop app for seeing Git branches and worktrees across repositories at a glance. If you want the original lightweight branch/worktree overview, Goblin is still worth a look; Hobgoblin extends that idea into a broader workspace for AI CLI sessions, multiple terminals, server mode, and richer repository workflows.
```

- [ ] **Step 2: Insert the Simplified Chinese README section**

In `README.zh-CN.md`, insert this section after the productivity formula explanation and before `## 产品特点`:

```markdown
## 起源

Hobgoblin 起源于 [Goblin](https://nano-props.github.io/goblin/)。Goblin 是一个小而美的 macOS 桌面项目，专注于一眼看清多个仓库里的 Git 分支和 worktree。如果你想体验最初那个轻量的分支/worktree 纵览，Goblin 仍然值得一看；Hobgoblin 则在这个想法之上扩展出 AI CLI 会话、多终端、server mode 和更完整的仓库工作流。
```

- [ ] **Step 3: Insert the Korean README section**

In `README.ko.md`, insert this section after the productivity formula explanation and before the product features section:

```markdown
## 기원

Hobgoblin은 [Goblin](https://nano-props.github.io/goblin/)에서 시작했습니다. Goblin은 여러 리포지토리의 Git 브랜치와 worktree를 한눈에 볼 수 있게 해 주는 작고 집중된 macOS 데스크톱 앱입니다. 원래의 가벼운 브랜치/worktree 개요를 원한다면 Goblin도 여전히 살펴볼 만합니다. Hobgoblin은 그 아이디어를 AI CLI 세션, 여러 터미널, server mode, 더 넓은 리포지토리 워크플로로 확장합니다.
```

- [ ] **Step 4: Insert the Japanese README section**

In `README.ja.md`, insert this section after the productivity formula explanation and before the product features section:

```markdown
## 起源

Hobgoblin は [Goblin](https://nano-props.github.io/goblin/) から始まりました。Goblin は、複数リポジトリの Git ブランチと worktree を一目で把握するための、小さく焦点の絞られた macOS デスクトップアプリです。最初の軽量なブランチ/worktree 概要を試したい場合、Goblin も引き続き見る価値があります。Hobgoblin はその発想を、AI CLI セッション、複数ターミナル、server mode、より広いリポジトリワークフローへ拡張しています。
```

- [ ] **Step 5: Verify README coverage**

Run:

```sh
rg -n "Origins|起源|기원|nano-props.github.io/goblin" "README.md" "README.zh-CN.md" "README.ko.md" "README.ja.md"
```

Expected: each README file has a heading and a Goblin homepage link.

---

### Task 2: Add The Pages Origin Recommendation

**Files:**

- Modify: `docs/index.html`

- [ ] **Step 1: Add scoped CSS for the origin band**

In the `<style>` block of `docs/index.html`, add this block after the feature-card styles and before the install styles:

```css
/* ORIGIN */
.origin-section {
  background: var(--bg);
}

.origin-band {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-card);
  padding: 32px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.origin-band .section-desc {
  margin-bottom: 0;
}

.origin-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 12px;
}
```

Also add this mobile rule inside the existing `@media (max-width: 640px)` block:

```css
.origin-band {
  flex-direction: column;
  padding: 24px;
}
```

- [ ] **Step 2: Add origin section markup**

In `docs/index.html`, add this markup after the closing `</section>` for `id="features"` and before the `id="install"` section:

```html
<!-- ORIGIN -->
<section id="origin" class="origin-section">
  <div class="container">
    <div class="origin-band fade-in">
      <div>
        <div class="section-label" data-i18n="origin_label">Origin</div>
        <h2 class="section-title" data-i18n-html="origin_title">From Goblin<br />to Hobgoblin</h2>
        <p class="section-desc" data-i18n="origin_desc">
          Hobgoblin began with Goblin, a small macOS app for seeing Git branches and worktrees at a glance. Goblin
          remains a focused option for the original lightweight workflow.
        </p>
      </div>
      <div class="origin-actions">
        <a
          href="https://nano-props.github.io/goblin/"
          class="btn btn-primary"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span data-i18n="origin_visit">Visit Goblin</span>
        </a>
        <a
          href="https://github.com/nano-props/goblin"
          class="btn btn-secondary"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span data-i18n="origin_source">Goblin source</span>
        </a>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Add English i18n strings**

In the `en` dictionary, add:

```js
          origin_label: 'Origin',
          origin_title: 'From Goblin<br/>to Hobgoblin',
          origin_desc:
            'Hobgoblin began with Goblin, a small macOS app for seeing Git branches and worktrees at a glance. Goblin remains a focused option for the original lightweight workflow.',
          origin_visit: 'Visit Goblin',
          origin_source: 'Goblin source',
```

- [ ] **Step 4: Add Simplified Chinese i18n strings**

In the `zh` dictionary, add:

```js
          origin_label: '起源',
          origin_title: '从 Goblin<br/>到 Hobgoblin',
          origin_desc:
            'Hobgoblin 起源于 Goblin。Goblin 是一个小而美的 macOS 应用，专注于一眼看清 Git 分支和 worktree，也仍然适合想要轻量原始工作流的用户。',
          origin_visit: '访问 Goblin',
          origin_source: 'Goblin 源代码',
```

- [ ] **Step 5: Add Korean i18n strings**

In the `ko` dictionary, add:

```js
          origin_label: '기원',
          origin_title: 'Goblin에서<br/>Hobgoblin으로',
          origin_desc:
            'Hobgoblin은 Git 브랜치와 worktree를 한눈에 보여 주는 작은 macOS 앱 Goblin에서 시작했습니다. Goblin은 원래의 가벼운 워크플로를 원하는 사용자에게 여전히 집중된 선택지입니다.',
          origin_visit: 'Goblin 보기',
          origin_source: 'Goblin 소스',
```

- [ ] **Step 6: Add Japanese i18n strings**

In the `ja` dictionary, add:

```js
          origin_label: '起源',
          origin_title: 'Goblin から<br/>Hobgoblin へ',
          origin_desc:
            'Hobgoblin は、Git ブランチと worktree を一目で把握する小さな macOS アプリ Goblin から始まりました。Goblin は、最初の軽量なワークフローを求めるユーザーにとって今も焦点の絞られた選択肢です。',
          origin_visit: 'Goblin を見る',
          origin_source: 'Goblin ソース',
```

- [ ] **Step 7: Verify Pages coverage**

Run:

```sh
rg -n "origin_|nano-props.github.io/goblin|github.com/nano-props/goblin" "docs/index.html"
```

Expected: markup and all four dictionaries contain the origin keys, plus both Goblin links.

---

### Task 3: Docs Verification

**Files:**

- Verify: `README.md`
- Verify: `README.zh-CN.md`
- Verify: `README.ko.md`
- Verify: `README.ja.md`
- Verify: `docs/index.html`

- [ ] **Step 1: Verify no origin locale is missing**

Run:

```sh
for file in README.md README.zh-CN.md README.ko.md README.ja.md; do printf '%s: ' "$file"; rg -q "nano-props.github.io/goblin" "$file" && echo ok; done
```

Expected:

```text
README.md: ok
README.zh-CN.md: ok
README.ko.md: ok
README.ja.md: ok
```

- [ ] **Step 2: Verify Pages key counts**

Run:

```sh
rg -o "origin_(label|title|desc|visit|source)" "docs/index.html" | wc -l
```

Expected: `25`, covering five keys in markup plus five keys in each of four locale dictionaries.

- [ ] **Step 3: Verify docs-only file changes**

Run:

```sh
git status --short "README.md" "README.zh-CN.md" "README.ko.md" "README.ja.md" "docs/index.html" "docs/superpowers/specs/2026-06-27-goblin-origin-recommendation-design.md" "docs/superpowers/plans/2026-06-27-goblin-origin-recommendation.md"
```

Expected: only these docs files are listed for this task. Existing unrelated terminal files may remain modified in the wider worktree and should not be touched.
