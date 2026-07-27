# Google Play Screenshot Plan

## 完成状态

以下三个设备密度均已完成五张 1080×1920 英文真实 UI 截图：

| 目录 | 密度 | 截图 |
| --- | ---: | --- |
| `phone/` | 420 dpi | Settings、Projects、Worktrees、Terminal、Terminals |
| `tablet-7/` | 288 dpi | Settings、Projects、Worktrees、Terminal、Terminals |
| `tablet-10/` | 216 dpi | Settings、Projects、Worktrees、Terminal、Terminals |

截图使用本地临时 RSA SSH 服务、通用 Git 演示仓库和普通目录生成。演示内容仅包含 `/private/tmp/demo`、`/private/tmp/demo-plain`、`README.md` 等通用值，不包含生产凭据或私有仓库。

## 隐私处理

- 首图使用 Settings 页，明确展示应用内隐私政策入口，避免 Hosts 页暴露本地账号。
- `03-worktrees.png` 只对顶部本地演示 SSH 目标标签做模糊处理。
- 模糊处理不改变工作树、分支、路径、按钮、连接状态或其他产品 UI。
- 其余截图仅做无 Alpha、无元数据的 PNG 归一化，不添加设备边框或营销文字。

## 稳定顺序

1. `01-settings.png`
2. `02-projects.png`
3. `03-worktrees.png`
4. `04-terminal.png`
5. `05-terminals.png`

## 复现

```bash
bash scripts/google-play/capture-screenshots.sh prepare phone
bash scripts/google-play/capture-screenshots.sh capture phone 01-settings.png
# 导航到其余目标页面后逐张 capture
bash scripts/google-play/capture-screenshots.sh reset
bash scripts/google-play/validate-release-assets.sh release/google-play/0.1.0/graphics
```

脚本不读取、保存或上传 SSH 密码和私钥。SSH 访问资料必须由操作者在运行时通过应用配置，并在完成后清理。
