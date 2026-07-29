# Host 本地端口转发设计

日期：2026-06-15

## 目标

为 Hobgoblin Android 增加 Host 级 SSH 本地端口转发能力，对应 OpenSSH `-L` 语义。每个 Host 可以保存多条转发规则，用户手动启动或停止。第一版聚焦开发服务访问场景，避免自动后台常驻和远端目标泛化。

## 非目标

- 不支持远程端口转发 `-R`。
- 不支持动态 SOCKS 转发 `-D`。
- 不支持自定义远端 host；远端固定为 SSH 服务器视角的 `127.0.0.1`。
- 不随应用启动或终端打开自动启动转发。
- 不清理服务端已有 `authorized_keys`。
- 不改 SSH 初始化逻辑；多份 Hobgoblin 公钥问题本次只记录审视结论。

## 用户确认的范围

- 转发类型：本地转发。
- 配置归属：Host 级持久化。
- 生命周期：手动启动、手动停止。
- 本地监听地址：支持 `127.0.0.1` 与 `0.0.0.0`，默认 `127.0.0.1`。
- 远端目标：固定 `127.0.0.1:<remotePort>`。
- 方案选择：Host 配置内保存规则，独立 SSH local-forward 运行时服务。

## 数据模型

新增 Host 端口转发规则模型：

```kotlin
data class HostPortForwardRule(
    val id: String,
    val name: String,
    val localBindAddress: HostPortForwardBindAddress,
    val localPort: Int,
    val remotePort: Int,
)

enum class HostPortForwardBindAddress(val value: String) {
    Loopback("127.0.0.1"),
    AllInterfaces("0.0.0.0"),
}
```

`SshHostProfile` 增加 `portForwards: List<HostPortForwardRule> = emptyList()`。校验规则：

- `localPort` 和 `remotePort` 必须在 `1..65535`。
- `name` 保存时 trim；为空时 UI 使用自动展示名，例如 `127.0.0.1:8080 -> 127.0.0.1:3000`。
- 同一个 Host 内不允许重复的 `localBindAddress + localPort`。
- 不做跨 Host 全局保存期冲突校验；运行时启动时检测真实端口占用。

## 持久化

`HostProfileCodec` 当前使用 7 个 Base64 字段保存 Host。为兼容旧数据：

- 新格式增加第 8 字段 `portForwards`。
- 旧的 7 字段记录继续可解码，转发规则为空列表。
- 第 8 字段使用 JSON 数组保存规则，外层仍沿用现有 Base64 字段编码。

该方案保持现有存储文件不迁移即可读，新增字段只影响新保存的 Host。

## 运行时架构

新增两个边界清晰的运行时组件：

### HostPortForwardManager

职责：

- 管理内存态 `ruleId -> ForwardSession`。
- 暴露 `start(host, rule)`、`stop(ruleId)`、`status(ruleId)`、`stopForHost(hostId)`。
- 启动前检查是否已有运行中的相同 `localBindAddress:localPort`。
- 将运行状态回传给 UI。

状态模型：

```kotlin
sealed interface HostPortForwardStatus {
    data object Stopped : HostPortForwardStatus
    data object Starting : HostPortForwardStatus
    data class Running(val startedAtMillis: Long) : HostPortForwardStatus
    data class Failed(val message: String) : HostPortForwardStatus
}
```

### SshLocalPortForwardService

职责：

- 加载 Host 的 SSH identity。
- 复用现有 host key trust 语义。
- 通过 SSHJ 建立独立 SSH 连接。
- 启动 local port forwarding。
- 关闭转发时释放 forwarding 和 SSH connection。

端点映射：

- 本地：`rule.localBindAddress.value:rule.localPort`
- 远端：`127.0.0.1:rule.remotePort`

终端会话与端口转发互不依赖。关闭 terminal 不影响已启动的转发；停止转发只关闭该转发自己的 SSH 连接。

## 错误处理

必须覆盖以下错误路径：

- 本地端口被占用：提示当前绑定地址和端口已被占用。
- 同一 App 内重复启动：启动前返回冲突，不创建第二条连接。
- Host 未配置 identity：提示先完成 SSH key setup 或导入私钥。
- Host key 未信任或已变更：复用现有信任判断，提示用户先处理 Host 信任。
- SSH 认证失败或连接失败：展示安全摘要，不输出私钥、密码或完整敏感命令。
- 远端服务不可达：转发启动本身可能成功；连接失败由客户端访问本地端口时暴露，UI 不主动探测远端服务。

## UI 设计

入口放在 Host 管理路径，不接入 Project/Workspace 第一版流程。

Host 规则列表展示：

- 名称或自动展示名。
- 本地监听地址，例如 `127.0.0.1:8080` 或 `0.0.0.0:8080`。
- 远端目标 `127.0.0.1:<remotePort>`。
- 当前状态：Stopped、Starting、Running、Failed。
- 操作：Start、Stop、Edit、Delete。

新增/编辑规则表单：

- Name。
- Local port。
- Bind address：`Local only` 对应 `127.0.0.1`，`LAN` 对应 `0.0.0.0`。
- Remote port。
- 当选择 `LAN` 时展示风险提示：同一局域网设备可能访问该手机端口。

规则保存后不自动启动。删除运行中的规则时先停止，再删除配置。

## 测试计划

单元测试：

- `HostPortForwardRule` 端口范围与重复规则校验。
- `HostProfileCodec` 同时解码 7 字段旧数据和 8 字段新数据。
- `HostPortForwardManager` 状态转换、重复启动、停止、`stopForHost`。
- 未配置 identity、Host key 未信任、端口冲突的错误映射。

集成边界测试：

- `SshLocalPortForwardService` 通过 fake client 验证端点映射为本地选择地址和远端 `127.0.0.1`。
- 删除 Host 时停止该 Host 的运行中转发。

UI 状态测试：

- 默认 bind address 是 `127.0.0.1`。
- 选择 `0.0.0.0` 显示 LAN 风险提示。
- Running 状态显示 Stop，Stopped/Failed 状态显示 Start。
- 保存重复本地绑定端口时给出表单错误。

## Hobgoblin 公钥重复审视

当前公钥安装脚本使用：

```sh
grep -qxF "$publicKeyLine" "$HOME/.ssh/authorized_keys" || printf '%s\n' "$publicKeyLine" >> "$HOME/.ssh/authorized_keys"
```

这可以避免完全相同的公钥行重复写入。服务端出现多份 `hobgoblin-android` 公钥，更可能来自多次生成不同 key，而不是同一行重复追加。

已识别的可能路径：

- 新增或编辑 Host 时，SSH 初始化成功后只把新 `identityRefId` 保存在当前表单状态；如果用户没有点击保存 Host，再次初始化会生成另一把新 key 并追加到服务端。
- 用户重复创建相同 `user@host:port` 的 Host，每个 Host 都可能生成独立 identity。
- 已有 identity 无法读取时，初始化服务会生成替代 identity，并追加新的公钥。

本次不修改初始化流程，也不清理服务端 `authorized_keys`。后续若要处理，应单独设计“初始化幂等化”和“可选清理旧 Hobgoblin 公钥”，并把服务端授权文件修改作为明确的高风险操作处理。

## 设计原则

- KISS：第一版只做本地转发和固定远端 loopback，不引入自动启动、后台常驻、SOCKS 或远端 host 配置。
- YAGNI：不提前实现通知、恢复、跨 Host 端口预占用或服务探测。
- DRY：复用现有 Host、identity、host key trust 和 SSHJ client 边界。
- SOLID：数据模型、运行时管理、SSH 细节和 UI 状态分离，便于独立测试和后续扩展。
