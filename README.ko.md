# Hobgoblin

[English](README.md) | [简体中文](README.zh-CN.md) | 한국어 | [日本語](README.ja.md)

Hobgoblin은 단순한 브랜치 관리 도구가 아닙니다. Git worktree 기반 개발과 AI CLI를 함께 쓰기 위한 고생산성 데스크톱 작업 공간입니다.

핵심 모델은 단순합니다: **멀티 프로젝트 + 멀티 worktree / 멀티 브랜치 + 멀티 터미널**. 여러 리포지토리를 열고, 병렬 브랜치를 별도 worktree로 격리하고, 터미널을 올바른 문맥에 연결한 뒤, Codex나 Claude 같은 AI CLI를 Git 상태를 놓치지 않고 실행할 수 있습니다.

## 스크린샷

| 작업 공간 개요 | 리포지토리 작업 공간 |
| --- | --- |
| ![Hobgoblin 작업 공간 개요](docs/screenshot-20260626-143532.png) | ![Hobgoblin 리포지토리 작업 공간](docs/screenshot-20260626-144523.png) |

## 생산성 공식

```text
Hobgoblin = 멀티 프로젝트 x 멀티 worktree / 멀티 브랜치 x 멀티 터미널
```

의도한 워크플로는 각 프로젝트, worktree, 브랜치, 터미널, AI CLI 세션을 Git 상태를 이해하는 하나의 작업 공간에 연결하는 것입니다.

## 제품 특징

- **AI CLI에 맞춘 워크플로:** 코딩 에이전트, Shell 작업, Git 상태를 같은 작업 문맥에 묶어 두고 서로 관계없는 터미널 창에 흩어지지 않게 합니다.
- **멀티 프로젝트 작업 공간:** 리포지토리를 탭으로 열고, 순서를 바꾸고, 이전 세션을 복원합니다.
- **멀티 worktree 브랜치 개발:** 병렬 브랜치용 worktree를 만들고 확인하여 하나의 checkout을 더럽히지 않고 진행합니다.
- **브랜치와 worktree 개요:** 브랜치 상태, worktree 상태, 최신 커밋, 연결된 Pull Request를 한 창에서 확인합니다.
- **문맥 안의 Git 작업:** checkout, pull, push, worktree 생성, 외부 도구에서 브랜치 열기, GitHub로 이동을 지원합니다.
- **멀티 터미널 실행 면:** 여러 서버 기반 터미널을 작업 공간과 대상 브랜치 / worktree 문맥에 연결합니다.
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
