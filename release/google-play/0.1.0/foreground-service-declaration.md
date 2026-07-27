# Google Play 前台服务声明

## 类型

- 清单类型：`specialUse`
- 权限：`android.permission.FOREGROUND_SERVICE`、`android.permission.FOREGROUND_SERVICE_SPECIAL_USE`
- 清单属性：`android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE=interactive_ssh_terminal_sessions`

## 可粘贴的英文功能说明

> Hobgoblin uses a special-use foreground service only for interactive SSH terminal sessions that the user explicitly starts. The service keeps the selected terminal connection usable while the user moves between Hobgoblin screens or briefly places the app in the background. An ongoing notification clearly identifies that terminal sessions are active and returns the user to the relevant session. The service stops when no eligible terminal session remains.

## 延迟启动的用户影响

> If the task is deferred, the user cannot immediately start or continue the requested interactive SSH terminal session. Commands cannot be entered and remote output cannot be received until the connection starts.

## 中断的用户影响

> If the task is interrupted, the live Android SSH client disconnects. The retained session remains visible so the user can reconnect. For a tmux-backed session, the remote tmux session may continue on the user's SSH host and can be reattached later.

## 为什么没有更精确的标准类型

该服务不是媒体播放、位置、相机、麦克风、健康、数据同步、远程消息、设备连接或短时任务。它维持用户正在感知并交互的通用 SSH PTY 会话，因此使用受审查的 `specialUse` 类型。

## 演示视频脚本

视频必须为审核团队可访问的长期稳定链接，建议设为不公开而非需要登录。录制真实发布候选版本，控制在 45–60 秒：

1. 显示 Hobgoblin 主机列表，并打开已配置的审核演示主机。
2. 从项目或主机明确点击新建 SSH 终端。
3. 在终端输入无敏感信息的命令，例如 `printf 'play-review\n'`，显示实时输出。
4. 切到另一个 Hobgoblin 页面，展示终端仍保留。
5. 回到 Android 主屏幕，展开持续通知，展示活动终端数量或标签。
6. 点击通知返回对应终端。
7. 关闭或删除最后一个活动 Android 终端，展示持续通知消失。

视频中不得出现真实用户名、个人主机名、IP、私钥、密码、令牌、私人仓库、通知中的个人终端输出或其他应用的敏感通知。

## 提交前检查

- 最终 AAB 清单仍包含上述类型、权限和 subtype 属性。
- 通知在服务启动时立即可见，文案准确，点击能返回应用。
- 服务只由用户启动的终端动作触发，不在开机、定时器或静默后台流程中启动。
- Play Console 的文字与视频展示同一版本行为。

官方说明：<https://support.google.com/googleplay/android-developer/answer/13392821>
