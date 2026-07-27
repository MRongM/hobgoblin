# Google Play 审核访问资料

Hobgoblin 的核心功能需要连接用户自有 SSH 主机，因此 Play Console 应选择“全部或部分功能受限”，并直接提供英文审核说明。真实凭据不得写入本文件、代码、截图、构建产物或 Git。

## 审核环境必须满足

- 在整个审核期持续在线，并可从 Google 审核网络访问。
- 使用专用低权限系统用户和专用 SSH 身份；不得复用个人或生产凭据。
- 无 VPN、地理限制、一次性密码、动态验证码、交互式条款或人工审批。
- 只暴露演示目录，并限制磁盘、CPU、进程、网络和命令权限。
- 预先放置一个无敏感数据的 Git 演示仓库，至少包含主分支、一个链接 worktree 和数条通用提交记录。
- 如演示 tmux，预先安装受支持的 tmux，并仅创建审核专用会话。
- 凭据在提交前由另一台未配置设备完整验证；审核结束后轮换或撤销。

## Play Console 中需要直接填写的内容

使用 Console 的专用字段填写以下事实，不在仓库中保留副本：

- SSH 主机地址。
- SSH 端口。
- 审核专用用户名。
- 审核专用私钥的安全下载方式，或与 Console 当时支持的凭据附件方式相匹配的静态访问资源。
- 精确主机密钥指纹。
- 演示仓库的绝对远程路径。
- 如有私钥口令，必须为可重复使用且审核期间不失效的值；更推荐使用无口令、权限严格受限、审核后撤销的专用密钥。

## 可粘贴的英文导航说明

> Hobgoblin is an SSH client for a server supplied by the user. Use the reviewer-only SSH details provided in this Play Console entry. Open Hobgoblin, choose Add host, enter the supplied host, user, and port, import the supplied reviewer private key, and compare the displayed host-key fingerprint with the supplied fingerprint before choosing Trust host key. Save the host. Open Projects, choose Add project, select the saved host, and enter the supplied absolute demo repository path. Save the project. You can now inspect worktrees and commits, open a native or tmux-backed SSH terminal, retain and reconnect terminal sessions, and inspect the saved port-forwarding screen. No Hobgoblin account is required.

## 独立复核

提交前，维护者应使用一台清除过 Hobgoblin 数据的 Android 设备或模拟器，严格按照 Console 中的英文说明从零完成：导入身份、信任主机密钥、保存主机、添加项目、打开工作树、运行终端、后台通知、重连和端口页面。任何一步依赖未写入 Console 的内部知识，都必须先修订说明。
