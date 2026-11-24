# SSH 远程仓库的 HTTP/2 同步

桌面版默认使用 SSH。在「设置 → SSH → 仓库同步协议」中，可按现有 SSH Host 别名选择 HTTP/2 RPC。仓库身份仍由 SSH Host 别名和远端路径识别。配置时请选择与该 SSH Host 对应的 RPC 地址。RPC 处理界面刷新时的分支快照、worktree 列表与状态读取。打开项目时的 SSH 检查、Git fetch / 写操作及其预检、终端和端口转发使用现有 SSH 链路。

## 在开发机启动仓库 RPC

用能访问仓库的普通开发账号，在与桌面端同版本的源码目录安装项目依赖。RPC 协议升级后，需要用新版本重启开发机进程。运行环境需要 Node.js 24 及 Git。准备服务器 TLS 证书和私钥，证书的 SAN 必须匹配桌面端配置的 RPC 域名或 IP。可以重复提供 `--repo-root`，每个允许显示的 linked worktree 也需要位于其中一个目录下。

```sh
(umask 077 && openssl rand -hex 32 > "$HOME/.hobgoblin-repo-rpc-token")

node scripts/start-remote-repo-rpc.ts \
  --host 192.0.2.10 \
  --port 32210 \
  --cert "$HOME/certs/repo-rpc.pem" \
  --key "$HOME/certs/repo-rpc-key.pem" \
  --token-file "$HOME/.hobgoblin-repo-rpc-token" \
  --repo-root /srv/projects
```

将示例 IP 替换成开发机的私网或 WireGuard 地址。监听地址省略时默认为 `127.0.0.1`。已有私有 CA 时，将签发 CA 的 PEM 填入桌面设置。使用自签名证书时填入该证书的 PEM。

## 在桌面切换协议

1. 填写项目已经使用的 SSH Host 别名，选择 **HTTP/2 RPC**。
2. 填写 RPC 地址和访问令牌，例如 `https://dev.example:32210`。
3. 选择「验证并保存」。下一次仓库刷新使用所选协议。遇到 RPC 错误时，上一份仓库状态仍可查看，错误会显示在对应的读取状态中。
4. 单个 worktree 读取失败，或明细超过响应预算时，其余 worktree 和分支信息照常更新。界面标记部分状态未更新，并保留已有明细。

## 对照验证

在桌面进程与开发机 RPC 进程启动时设 `GOBLIN_SERVER_LOG_LEVEL=debug`。保持开发机、仓库、worktree 和终端负载相同，分别在 SSH 和 HTTP/2 RPC 下执行同样的刷新次数。

- 桌面日志 `repository refresh read` 记录协议、读取类型、耗时和结果。RPC 的 `combined` 对应 SSH 的 `snapshot` 和 `status` 两段。SSH 状态为空时记录为 `empty`。
- 开发机日志 `repository RPC read` 记录排队、扫描耗时和失败原因，或部分失败的 worktree 数。
- 桌面日志 `SSH terminal started` 和 `SSH terminal exited` 用于比较同等负载下的退出次数。退出码 `255` 是排查信号，需结合现场确认退出原因。
