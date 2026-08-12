# Windows 11 内部终端默认 Shell 评估

日期：2026-08-10

## 结论

Hobgoblin 内部终端应继续采用 **xterm.js（渲染）+ node-pty/ConPTY（伪终端）+ 一个命令行 Shell（子进程）**，不要把 `wt.exe` / Windows Terminal 当作内部 Shell 启动。

推荐的 Windows 11 默认选择顺序：

1. 已安装且可启动的稳定版 `pwsh.exe`（PowerShell 7）。
2. 系统内置的 Windows PowerShell 5.1 `powershell.exe`。
3. 有效的 `%COMSPEC%`，最后兜底 `%SystemRoot%\System32\cmd.exe`。

因此，当前只取 `%COMSPEC%`（通常是 `cmd.exe`）的策略不应继续作为首选。PowerShell 7 是最佳开发体验，但不是 Windows 11 的系统必备组件，不能成为无回退的唯一默认值。

## 候选方案

| 候选                                      | Windows 11 默认可用性                                                              | 开发与 Unicode 体验                                                                            | 结论                     |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------ |
| PowerShell 7 (`pwsh.exe`)                 | 不随 Windows 11 必然安装；与 5.1 并行安装。微软推荐 Windows 客户端通过 WinGet 安装 | 现代、跨平台；文本输出默认 `utf8NoBOM`                                                         | **安装时首选**           |
| Windows PowerShell 5.1 (`powershell.exe`) | Windows 默认安装，属于 Windows 组件                                                | 功能明显强于 cmd；文件编码默认行为不一致，包含 ANSI、UTF-16LE 等历史行为                       | **可靠系统回退**         |
| Command Prompt (`cmd.exe`)                | Windows 11 内置；`COMSPEC` 通常指向它                                              | 兼容批处理和旧工具，但交互、脚本能力及代码页行为较旧                                           | **最后回退**             |
| Windows Terminal (`wt.exe`)               | Windows 11 随系统提供，Windows 11 22H2 起成为默认控制台宿主                        | 它是图形终端宿主，不是 Shell；启动它会转到外部窗口，无法成为当前 xterm/node-pty 会话的子 Shell | **仅用于“外部终端”功能** |

依据：

- Microsoft 明确说明 Windows PowerShell 5.1 默认安装，而 PowerShell 7 需另行安装并与其并存：[Install PowerShell 7 on Windows](https://learn.microsoft.com/en-us/powershell/scripting/install/install-powershell-on-windows)。
- Windows PowerShell 5.1 是操作系统默认安装的一部分，其支持跟随 Windows 生命周期：[about_PowerShell_Editions](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_editions)、[PowerShell Support Lifecycle](https://learn.microsoft.com/en-us/powershell/scripting/install/powershell-support-lifecycle)。
- Windows Terminal 是承载 Command Prompt、PowerShell、WSL 等 Shell 的宿主应用；官方 FAQ 还明确说明 VS Code 的集成终端使用 xterm.js，不能把 Windows Terminal 用作其集成终端：[Windows Terminal overview](https://learn.microsoft.com/en-us/windows/terminal/)、[Windows Terminal FAQ](https://learn.microsoft.com/en-us/windows/terminal/faq)。
- Windows Terminal 随 Windows 11 提供，并不改变其“终端宿主而非 Shell”的角色：[Windows 11 overview](https://learn.microsoft.com/en-us/windows/whats-new/windows-11-overview)、[Command Prompt and Windows PowerShell](https://support.microsoft.com/en-US/Windows/Apps/command-prompt-and-windows-powershell)。

## 实施建议

### 1. 发现与启动顺序

只解析可执行文件，直接把 `executable` 和 `argv[]` 交给 `node-pty.spawn`；不要拼接命令字符串，也不要通过 `cmd /c`、`powershell -Command` 或 `Start-Process` 再包一层。

建议的发现顺序：

1. 检查 MSI 的标准位置 `%ProgramFiles%\PowerShell\7\pwsh.exe`。
2. 只在继承的 `PATH` 绝对目录中查找 `pwsh.exe`。不要直接使用 `where.exe pwsh.exe`，因为 `where` 还会搜索当前目录，而当前目录可能是未受信任的仓库。ZIP 或 Store 安装仍可通过 `PATH` 被发现。
3. 检查 `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`。
4. 检查 `%COMSPEC%` 是否为存在的绝对可执行文件；无效时检查 `%SystemRoot%\System32\cmd.exe`。
5. 候选在“检查后、启动前”仍可能被移除；某个候选发生 spawn 错误时，应记录候选和系统错误并尝试下一项。

官方依据：`where` 默认搜索当前目录和 `PATH`，这也是实现必须排除当前目录的原因：[where](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/where)。PowerShell 7 MSI 默认安装到 `%ProgramFiles%\PowerShell\7`；MSIX/Store 安装位于版本化的 WindowsApps 目录，ZIP 位置由用户决定：[Install PowerShell 7 on Windows](https://learn.microsoft.com/en-us/powershell/scripting/install/install-powershell-on-windows)。Windows PowerShell 的系统路径由官方示例给出：[about_Run_With_PowerShell](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_run_with_powershell?view=powershell-7.5)。`COMSPEC` 是 cmd 环境通常提供的系统变量：[set](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/set_1)。

### 2. 交互参数

正常的开发终端应启动真正的交互会话：

| Shell            | 正常启动参数 | 无配置恢复/诊断参数  |
| ---------------- | ------------ | -------------------- |
| `pwsh.exe`       | `-NoLogo`    | `-NoLogo -NoProfile` |
| `powershell.exe` | `-NoLogo`    | `-NoLogo -NoProfile` |
| `cmd.exe`        | 无           | `/d`（禁用 AutoRun） |

- 不需要 `-NoExit`：没有传入启动命令时本来就是交互会话；该参数的语义是“运行启动命令后不退出”。
- 不得给正常内部终端传 `-NonInteractive`，该参数专用于不应请求用户输入的脚本/CI 会话。
- 不传 `-Command` 或 `-WorkingDirectory`；工作目录应只由 `node-pty.spawn(..., { cwd })` 设置，避免 Windows 引号和非 ASCII 路径被二次解析。
- 不传 `-ExecutionPolicy Bypass`，不要悄悄改变用户的安全边界。

参数语义见 [about_Pwsh](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_pwsh) 与 [about_PowerShell_exe](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_powershell_exe?view=powershell-5.1)。

### 3. Profile 风险与回退边界

普通开发终端应默认加载用户 profile，因为别名、函数、环境变量和提示符通常存放于其中；全局使用 `-NoProfile` 会让内部终端与用户日常开发环境不一致。[about_Profiles](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_profiles) 说明了 profile 的用途以及 `-NoProfile` 的效果。

由于 profile 能执行用户命令，可以推断它可能变慢、报错或主动退出。应区分两种失败：

- **可执行文件无法 spawn**：自动尝试下一候选。
- **Shell 已成功启动后退出**：保留退出信息，不自动换成另一种 Shell；提供明确的“使用无配置 PowerShell 重试”操作，以免掩盖用户 profile 问题。

不要因为普通 profile 输出一条错误就切换 Shell；PTY 已经成功工作，错误本身应该在终端中可见。

### 4. 编码与 ConPTY

PowerShell 7 的文件文本输出默认 `utf8NoBOM`；Windows PowerShell 5.1 的 cmdlet/重定向默认编码并不一致，可能是 ANSI、ASCII、UTF-16LE 或带 BOM 的 UTF-8。这是优先 PowerShell 7 的重要理由：[about_Character_Encoding](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding)。

这与终端传输编码要分开看：Windows ConPTY 的通道始终使用 UTF-8，但它不会改变所连接客户端程序自身的代码页或文件编码；转换由伪控制台完成：[Pseudoconsoles](https://learn.microsoft.com/en-us/windows/console/pseudoconsoles)。因此不应在启动时全局强制 `chcp 65001`，也不应给 cmd 默认加 `/u`，以免破坏旧工具兼容性。

Windows 11 满足 node-pty 的 ConPTY 要求；node-pty 官方说明 Windows 使用 ConPTY，并展示了把 PowerShell 作为直接子进程交给 PTY 的方式：[microsoft/node-pty](https://github.com/microsoft/node-pty)。渲染端应继续把实际的 `backend: "conpty"` 和 Windows build number 传给 xterm.js 的 `windowsPty` 选项，以启用对应换行/回流兼容逻辑：[xterm.js `windowsPty`](https://xtermjs.org/docs/api/terminal/interfaces/iterminaloptions/)。

## CI 验证建议

GitHub 托管的 `windows-latest` 当前是 Windows Server，而不是 Windows 11 x64；官方 runner 镜像清单列出了 `windows-latest` / `windows-2025` 对应 Windows Server 2025，并预装 PowerShell 7：[actions/runner-images](https://github.com/actions/runner-images)、[Windows Server 2025 image](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-Readme.md)。它适合验证 node-pty/ConPTY 和打包产物，但不能单独作为“Win11 客户端行为已验证”的证据。GitHub 提供的 `windows-11-arm` 仍是 ARM64 公测；x64 Win11 发布门禁需要自托管 Windows 11 runner：[Choosing the runner for a job](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)、[Self-hosted runners reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners)。

最低验证矩阵：

1. 解析器单测：模拟 `pwsh` 存在/缺失/损坏、Windows PowerShell 存在、`COMSPEC` 无效等分支，验证选择和 spawn 失败回退。
2. `windows-2025` 打包 smoke：通过实际 terminal worker + node-pty 创建内部会话；工作目录包含空格和中文；输入命令并断言 cwd、Shell 身份、Unicode 回显、正常退出。
3. 分别显式验证 `pwsh.exe -NoLogo -NoProfile`、系统 `powershell.exe -NoLogo -NoProfile` 和 `cmd.exe /d`，避免托管镜像预装 pwsh 使后两条回退永远未覆盖。
4. 验证 PTY resize，并断言服务端返回 `conpty` 及真实 Windows build number，渲染端收到相同的 xterm `windowsPty` 信息。
5. 发布前在 Win11 x64 实机/自托管 runner 上运行打包应用端到端 smoke；断言内部 xterm 面板创建并保持存活，而非只证明后端 PTY 能创建。

CI 脚本应使用 `-NoProfile` 隔离 runner 的用户配置；产品的交互会话仍加载 profile。GitHub 也明确区分 `pwsh` 默认 UTF-8 与 Windows PowerShell 5.1 非 UTF-8 默认行为：[Workflow commands for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands)。

## 不建议做的事

- 不调用 `wt.exe` 实现内部终端；它只适用于现有“外部终端”入口。
- 不捆绑一份 PowerShell 7，仅为改变默认 Shell 会显著增加更新与安全维护责任。
- 不把 `pwsh.exe` 当作 Win11 必然存在，也不只用固定 MSI 路径发现它。
- 不用拼接后的命令行字符串传路径或启动命令。
- 不在正常开发会话中默认禁用用户 profile，也不在 Shell 已启动后静默切换到另一种 Shell。
