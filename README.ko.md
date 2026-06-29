# Hobgoblin

[English](README.md) | [简体中文](README.zh-CN.md) | 한국어 | [日本語](README.ja.md)

Hobgoblin은 단순한 브랜치 관리 도구가 아닙니다. Git worktree 기반 개발과 AI CLI를 함께 쓰기 위한 고생산성 작업 공간이며, 데스크톱 앱 또는 브라우저에서 접근하는 server mode로 사용할 수 있습니다.

핵심 모델은 단순합니다: **멀티 프로젝트 + 멀티 worktree / 멀티 브랜치 + 멀티 터미널**. 여러 리포지토리를 열고, 병렬 브랜치를 별도 worktree로 격리하고, 터미널을 올바른 문맥에 연결한 뒤, Codex나 Claude 같은 AI CLI를 Git 상태를 놓치지 않고 실행할 수 있습니다. 로컬 리포지토리, Git SSH 원격 주소, SSH config alias와 원격 경로로 접근하는 SSH 원격 리포지토리를 지원합니다.

## 스크린샷

<p>
  <img src="docs/screenshot-20260626-143532.png" alt="Hobgoblin 작업 공간 개요" width="49%" />
  <img src="docs/screenshot-20260626-144523.png" alt="Hobgoblin 리포지토리 작업 공간" width="49%" />
</p>

## 생산성 공식

```text
Hobgoblin = 멀티 프로젝트 x 멀티 worktree / 멀티 브랜치 x 멀티 터미널
```

의도한 워크플로는 각 프로젝트, worktree, 브랜치, 터미널, AI CLI 세션을 Git 상태를 이해하는 하나의 작업 공간에 연결하는 것입니다.

## 기원

Hobgoblin은 [Goblin](https://nano-props.github.io/goblin/)에서 시작했습니다. Goblin은 여러 리포지토리의 Git 브랜치와 worktree를 한눈에 볼 수 있게 해 주는 작고 집중된 macOS 데스크톱 앱입니다. 원래의 가벼운 브랜치/worktree 개요를 원한다면 Goblin도 여전히 살펴볼 만합니다. Hobgoblin은 그 아이디어를 AI CLI 세션, 여러 터미널, server mode, 더 넓은 리포지토리 워크플로로 확장합니다.

## 제품 특징

- **AI CLI에 맞춘 워크플로:** 코딩 에이전트, Shell 작업, Git 상태를 같은 작업 문맥에 묶어 두고 서로 관계없는 터미널 창에 흩어지지 않게 합니다.
- **멀티 프로젝트 작업 공간:** 리포지토리를 탭으로 열고, 순서를 바꾸고, 이전 세션을 복원합니다.
- **데스크톱 또는 웹 브라우저:** 패키지된 데스크톱 앱으로 사용하거나 server mode를 실행해 같은 작업 공간을 브라우저에서 열 수 있습니다.
- **멀티 worktree 브랜치 개발:** 병렬 브랜치용 worktree를 만들고 확인하여 하나의 checkout을 더럽히지 않고 진행합니다.
- **브랜치와 worktree 개요:** 브랜치 상태, worktree 상태, 최신 커밋, 연결된 Pull Request를 한 창에서 확인합니다.
- **문맥 안의 Git 작업:** checkout, pull, push, worktree 생성, 외부 도구에서 브랜치 열기, GitHub로 이동을 지원합니다.
- **멀티 터미널 실행 면:** 여러 서버 기반 터미널을 작업 공간과 대상 브랜치 / worktree 문맥에 연결합니다.
- **로컬 및 SSH 원격 리포지토리:** 로컬 경로, SSH clone URL, SSH config alias와 원격 경로로 여는 원격 리포지토리를 지원합니다.
- **시각적 워크플로 제어:** 명확한 인터페이스 컨텍스트에서 브랜치를 탐색하고, 리포지토리를 전환하고, Git 작업과 외부 도구 이동을 실행합니다.
- **테마와 언어:** 라이트, 다크, 테마 프리셋과 영어, 중국어 간체, 한국어, 일본어 UI 문구를 제공합니다.

## 매직 작업

- **터미널 입력에 바이너리 붙여넣기:** 터미널 입력창에 바이너리 클립보드 내용을 붙여넣으면 임시 파일을 만들고 생성된 파일 경로를 입력합니다.
- **파일 트리에서 터미널로 드래그:** 파일 트리의 파일을 터미널로 드래그해 직접 입력하지 않고 shell-safe 경로를 삽입합니다.
- **파일 트리 파일 두 번 클릭:** 파일 트리에서 파일을 두 번 클릭하면 설정된 편집기에서 해당 파일을 바로 엽니다.
- **클립보드 기반 파일 흐름:** `Ctrl+Shift+V`로 클립보드 텍스트를 파일에 쓰고, `Ctrl+Shift+C`로 파일 텍스트를 시스템 클립보드에 복사합니다.
- **터미널 탭 점프:** 활성 터미널 탭을 두 번 클릭하면 해당 터미널을 맨 아래로 스크롤합니다.
- **터미널에서 파일 트리로 이동:** 터미널 출력에서 감지된 리포지토리 상대 경로를 클릭해 파일 트리에서 해당 파일을 표시합니다.
- **터미널 경로 편집기 점프:** 터미널 출력에서 감지된 리포지토리 상대 경로(`path:line`, `path:line:column` 지원)를 두 번 클릭하면 설정된 편집기에서 해당 행과 열을 엽니다.
- **tmux 기반 세션 복원:** 사용 가능한 경우 tmux 기반 원격 터미널 세션을 감지해 사용하고, 원격 터미널 상태를 복원 가능하게 유지합니다.
- **브라우저 프로젝트 접근:** server mode를 실행하고 웹 브라우저에서 프로젝트 작업 공간을 엽니다.
- **모바일 터미널 인계:** 브라우저 접근 모드에서 휴대폰 브라우저로 터미널 세션을 이어받아 모바일 상황에서도 계속 작업합니다.

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
```

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

## 웹 브라우저 / Server Mode

Web UI를 빌드하고 server mode를 시작한 뒤, 브라우저에서 Hobgoblin을 엽니다:

```sh
./serve.sh
```

기본 브라우저 URL:

```text
http://127.0.0.1:32200
```

다른 인터페이스나 포트로 노출해야 할 때는 수신 주소를 바꿀 수 있습니다:

```sh
./serve.sh --host 127.0.0.1 --port 32200
```

## 링크

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [소스 코드](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)

## 라이선스

Hobgoblin은 MIT 라이선스를 사용합니다.
