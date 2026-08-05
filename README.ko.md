# Hobgoblin

[English](README.md) | [简体中文](README.zh-CN.md) | 한국어 | [日本語](README.ja.md)

Hobgoblin은 단순한 브랜치 관리 도구가 아닙니다. Git worktree 기반 개발과 AI CLI를 함께 쓰기 위한 고생산성 작업 공간이며, 데스크톱 앱 또는 브라우저에서 접근하는 server mode로 사용할 수 있습니다.

핵심 모델은 단순합니다: **멀티 프로젝트 + 멀티 worktree / 멀티 브랜치 + 멀티 터미널**. 여러 리포지토리를 열고, 병렬 브랜치를 별도 worktree로 격리하고, 터미널을 올바른 문맥에 연결한 뒤, Codex나 Claude 같은 AI CLI를 Git 상태를 놓치지 않고 실행할 수 있습니다. 로컬 리포지토리, Git SSH 원격 주소, SSH config alias와 원격 경로로 접근하는 SSH 원격 리포지토리를 지원합니다.

## 생산성 공식

```text
Hobgoblin = 멀티 프로젝트 x 멀티 worktree / 멀티 브랜치 x 멀티 터미널
```

의도한 워크플로는 각 프로젝트, worktree, 브랜치, 터미널, AI CLI 세션을 Git 상태를 이해하는 하나의 작업 공간에 연결하는 것입니다.

## 워크스페이스 개발 모델

Hobgoblin은 제품 워크스페이스와 그 안의 Git 리포지토리를 서로 연결되어 있지만 경계가 분명한 단계로 다룹니다.

- **멀티 리포지토리 워크스페이스:** 읽을 수 있는 하나의 루트 아래에 선택한 리포지토리를 구성합니다. 루트는 공유 파일과 루트 터미널을 제공하고, 각 멤버 리포지토리는 브랜치, worktree, 상태, 이력, Git 쓰기 작업을 독립적으로 유지합니다.
- **Branch workspace(브랜치 워크스페이스):** 부모 워크스페이스 안에 하나의 브랜치 작업에 집중하는 컨텍스트를 만듭니다. 선택한 리포지토리의 멤버 worktree는 공통 브랜치 이름을 사용하지만 각각은 독립적인 Git 작업 경계로 남습니다.

권장 흐름:

1. 워크스페이스에 포함할 멤버 리포지토리를 구성합니다.
2. Branch workspace를 만들고 선택한 각 리포지토리의 기준 브랜치를 명시합니다.
3. 필요한 워크스페이스 의존 항목을 복사하거나 심볼릭 링크로 준비한 뒤, 브랜치 워크스페이스 루트 또는 개별 멤버 worktree에서 작업합니다.
4. 개발과 테스트 중 AI CLI와 터미널 세션을 해당 루트 또는 멤버 컨텍스트에 연결해 둡니다.
5. 작업이 준비되면 선택한 멤버에 커밋, 풀, 푸시, 머지 인, 머지 아웃을 실행합니다.

리포지토리 간 작업은 설정 순서대로 실행되고 개별 멤버가 실패해도 이후 멤버를 계속 처리한 뒤 오류를 한 번에 모읍니다. 완료된 멤버의 결과는 유지되며 자동 롤백되는 원자적 트랜잭션으로 가장하지 않습니다.

## 기원

Hobgoblin은 [Goblin](https://nano-props.github.io/goblin/)에서 시작했습니다. Goblin은 여러 리포지토리의 Git 브랜치와 worktree를 한눈에 볼 수 있게 해 주는 작고 집중된 macOS 데스크톱 앱입니다. 원래의 가벼운 브랜치/worktree 개요를 원한다면 Goblin도 여전히 살펴볼 만합니다. Hobgoblin은 그 아이디어를 AI CLI 세션, 여러 터미널, server mode, 더 넓은 리포지토리 워크플로로 확장합니다.

## 제품 특징

- **AI CLI에 맞춘 워크플로:** 코딩 에이전트, Shell 작업, Git 상태를 같은 작업 문맥에 묶어 두고 서로 관계없는 터미널 창에 흩어지지 않게 합니다.
- **프로젝트와 멀티 리포지토리 워크스페이스:** 단일 리포지토리, 일반 디렉터리 또는 여러 독립 리포지토리로 구성한 워크스페이스를 열고 나중에 복원합니다.
- **Branch workspace:** 공통 브랜치 컨텍스트 아래 선택한 리포지토리 worktree를 가로질러 하나의 기능을 개발하며 루트와 멤버 각각의 파일과 터미널을 사용할 수 있습니다.
- **데스크톱 또는 웹 브라우저:** 패키지된 데스크톱 앱으로 사용하거나 server mode를 실행해 같은 작업 공간을 브라우저에서 열 수 있습니다.
- **멀티 worktree 브랜치 개발:** 병렬 브랜치용 worktree를 만들고 확인하여 하나의 checkout을 더럽히지 않고 진행합니다.
- **브랜치와 worktree 개요:** 브랜치 상태, worktree 상태, 최신 커밋, 연결된 Pull Request를 한 창에서 확인합니다.
- **문맥 안의 Git 작업:** checkout, pull, push, worktree 생성, 외부 도구에서 브랜치 열기, GitHub로 이동을 지원합니다.
- **멀티 터미널 실행 면:** 여러 서버 기반 터미널을 작업 공간과 대상 브랜치 / worktree 문맥에 연결합니다.
- **로컬 및 SSH 원격 리포지토리:** 로컬 경로, SSH clone URL, SSH config alias와 원격 경로로 여는 원격 리포지토리를 지원합니다.
- **Android 모바일 클라이언트:** SSH Host를 저장하고 원격 Project와 Worktree를 열며, 터미널 세션 유지, 포트 포워드 관리, 데스크톱 밖에서의 작업 계속을 지원합니다.
- **tmux 세션 연속성:** 프로젝트별 tmux server에서 결정적인 Hobgoblin 세션을 명시적으로 만들거나 다시 연결하고, Android에서 Hobgoblin 및 기본 tmux 세션을 탐색하고 복구합니다.
- **시각적 워크플로 제어:** 명확한 인터페이스 컨텍스트에서 브랜치를 탐색하고, 리포지토리를 전환하고, Git 작업과 외부 도구 이동을 실행합니다.
- **테마와 언어:** 라이트, 다크, 테마 프리셋과 영어, 중국어 간체, 한국어, 일본어 UI 문구를 제공합니다.

## 매직 작업

- **`hob`으로 프로젝트 열기(macOS):** 터미널에서 `hob .` 또는 `hob <directory>`를 실행하면 해당 로컬 디렉터리를 Hobgoblin에서 열거나 가져올 수 있습니다.
- **전역 터미널 전환:** 내부 터미널에 포커스가 있을 때 macOS에서는 `Cmd+Option+Up/Down`, Windows/Linux에서는 `Ctrl+Alt+Up/Down`을 사용해 프로젝트와 worktree를 가로질러 열려 있는 모든 내부 터미널을 전환할 수 있습니다.
- **터미널 입력에 바이너리 붙여넣기:** 터미널 입력창에 바이너리 클립보드 내용을 붙여넣으면 임시 파일을 만들고 생성된 파일 경로를 입력합니다.
- **파일 트리에서 터미널로 드래그:** 파일 트리의 파일을 터미널로 드래그해 직접 입력하지 않고 shell-safe 경로를 삽입합니다.
- **파일 트리 파일 두 번 클릭:** 파일 트리에서 파일을 두 번 클릭하면 설정된 편집기에서 해당 파일을 바로 엽니다.
- **파일 내용 클립보드 단축키:** macOS에서는 `Cmd+Shift+C/V`, Windows/Linux에서는 `Ctrl+Shift+C/V`를 사용합니다. `C`는 포커스된 파일의 텍스트 또는 이미지 내용을 시스템 클립보드에 복사하고, `V`는 지원되는 클립보드 텍스트 또는 이미지 내용으로 해당 파일을 바꿉니다.
- **터미널 탭 점프:** 활성 터미널 탭을 두 번 클릭하면 해당 터미널을 맨 아래로 스크롤합니다.
- **터미널에서 파일 트리로 이동:** 터미널 출력에서 감지된 리포지토리 상대 경로를 클릭해 파일 트리에서 해당 파일을 표시합니다.
- **터미널 경로 편집기 점프:** 터미널 출력에서 감지된 리포지토리 상대 경로(`path:line`, `path:line:column` 지원)를 두 번 클릭하면 설정된 편집기에서 해당 행과 열을 엽니다.
- **명시적 tmux 세션 재사용:** 내부 터미널은 기본적으로 네이티브 로그인 셸을 사용합니다. 터미널 또는 항목 메뉴에서 **tmux로 새 터미널**을 선택하면 프로젝트별 tmux server에서 안정적인 로컬/SSH `hobgoblin-v1-*` 세션을 만들거나 다시 연결합니다. tmux가 없거나 시작에 실패하면 터미널이 종료되고 Native를 선택하라는 안내를 표시하며, 네이티브 셸을 조용히 시작하지 않습니다. 외부 터미널 동작은 항상 네이티브로 유지되며 기존 `goblin-*` 세션은 마이그레이션하지 않습니다.
- **Android tmux 복구:** Android의 tmux 탭은 선택한 SSH Host의 프로젝트별 server와 호환 기본 server에 있는 현재 프로토콜 Hobgoblin 세션을 일반 기본 tmux 세션과 함께 검색합니다. 대체 세션을 만들지 않고 기존 세션을 직접 열 수 있습니다.
- **브라우저 프로젝트 접근:** server mode를 실행하고 웹 브라우저에서 프로젝트 작업 공간을 엽니다.
- **모바일 터미널 인계:** 브라우저 접근 모드에서 휴대폰 브라우저로 터미널 세션을 이어받아 모바일 상황에서도 계속 작업합니다.

## 설치

[GitHub Releases](https://github.com/MRongM/hobgoblin/releases)에서 최신 빌드를 다운로드하세요.

플랫폼에 맞는 파일을 선택하세요:

- **macOS Apple Silicon:** `arm64.dmg` 파일을 다운로드합니다.
- **macOS Intel:** `x64.dmg` 파일을 다운로드합니다.
- **Windows x64:** `.exe` 설치 파일을 다운로드합니다.
- **Android:** `android.apk` 파일을 다운로드합니다. APK는 서명되지 않았으므로 설치 전에 서명해야 합니다.
- **Linux Server Mode:** 배포용 소스 아카이브 `Hobgoblin-<version>-linux-source.tar.gz`를 다운로드합니다.

현재 빌드는 서명되지 않았습니다.

macOS에서는 Gatekeeper가 다운로드한 앱을 차단할 수 있습니다. 이 경우 앱을 오른쪽 클릭하고 **열기**를 선택한 뒤 확인하세요. 설치 후 격리 플래그를 제거할 수도 있습니다:

```sh
xattr -dr com.apple.quarantine /Applications/Hobgoblin.app
```

Windows에서는 SmartScreen이 서명되지 않은 설치 파일에 대해 경고할 수 있습니다. GitHub Release 출처를 신뢰하는 경우에만 계속하세요.

### macOS 터미널에서 프로젝트 열기

`Hobgoblin.app`을 `/Applications`로 이동한 뒤 사용자 범위의 `hob` 런처를 설치합니다:

```sh
mkdir -p "$HOME/.local/bin"
ln -s "/Applications/Hobgoblin.app/Contents/Resources/bin/hob" "$HOME/.local/bin/hob"
```

`$HOME/.local/bin`이 `PATH`에 포함되어 있는지 확인한 다음 현재 디렉터리를 열거나 가져옵니다:

```sh
hob .
```

이 명령은 디렉터리 인수를 0개 또는 1개 받으며, 생략하면 현재 디렉터리를 사용합니다. 위 링크 명령은 기존 `hob` 명령을 덮어쓰지 않습니다.

## 로컬 빌드 및 설치

요구 사항:

- Bun
- Node.js 24+

macOS에서 데스크톱 앱을 빌드하고 설치합니다:

```sh
bun run install:app
```

이 명령은 현재 호스트 아키텍처의 `Hobgoblin.app`을 빌드해 `~/Applications`에 설치하고, 대상 경로가 비어 있으면 `$HOME/.local/bin/hob`을 안전하게 만듭니다. 기존 명령은 덮어쓰지 않습니다.

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

### Linux systemd 배포

systemd를 사용하는 Linux 호스트에 Node.js 24+와 Bun 1.3.11을 설치하고, GitHub Releases에서 `Hobgoblin-<version>-linux-source.tar.gz`를 다운로드한 뒤 압축을 풀어 설치합니다.

```sh
tar -xzf Hobgoblin-<version>-linux-source.tar.gz
cd Hobgoblin-<version>
./scripts/serve-systemd.sh
```

처음 실행하면 서비스가 설치되고, 이후 실행하면 기존 배포가 업데이트됩니다. 최초 설치 시 수신 주소, 포트, 영구 데이터 디렉터리를 명시하려면 다음과 같이 실행합니다.

```sh
./scripts/serve-systemd.sh install \
  --host 0.0.0.0 \
  --port 32200 \
  --data-dir ./data/server
```

`0.0.0.0`은 모든 네트워크 인터페이스에서 수신합니다. 로컬 호스트에서만 접근할 수 있게 하려면 대신 `127.0.0.1`을 사용하세요.

설치 과정에서는 `bun install`을 실행하고 Web UI를 빌드하며, `/etc/systemd/system/hobgoblin.service`와 `/etc/hobgoblin/server.env`를 작성한 다음 서비스를 활성화하고 시작합니다. root가 아닌 사용자로 실행하면 스크립트가 `sudo`를 사용합니다.

자주 사용하는 유지 관리 명령:

```sh
./scripts/serve-systemd.sh update --no-pull
./scripts/serve-systemd.sh status
./scripts/serve-systemd.sh logs
./scripts/serve-systemd.sh uninstall
```

소스 배포 아카이브에는 Git 메타데이터가 없으므로 새 아카이브 내용으로 교체한 뒤에는 `update --no-pull`을 사용하세요. Git clone에서는 `update`를 그대로 사용해 기본적으로 `git pull --ff-only`를 시도할 수 있습니다. `uninstall`은 서비스를 중지하고 제거하지만 `/etc/hobgoblin/server.env`는 보존합니다. 더 이상 필요하지 않으면 직접 삭제하세요.

## 링크

- [GitHub Pages](https://mrongm.github.io/hobgoblin/)
- [소스 코드](https://github.com/MRongM/hobgoblin)
- [Releases](https://github.com/MRongM/hobgoblin/releases)
