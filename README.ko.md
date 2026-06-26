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
