# Hobgoblin Google Play 更新记录

- [x] Compass 软链并加入 Git Ignore。
- [x] 使用指定本地上传密钥和凭据构建、签名并校验 AAB。
- [x] 从实际 Manifest 验证包名 `com.mrongm.hobgoblin`、versionCode `13`、versionName `2.3.2`。
- [x] 在 Hobgoblin 正式版草稿移除包名错误的上传，改选 `hobgoblin-2.3.2-13-verified.aab`。
- [x] Console 接收版本 `13 (2.3.2)`，填写真实更新说明、预览并保存。
- [x] 发布概览仅包含 `Hobgoblin 2.3.2 (13)` 一项变更，完成送审。

最终页面证据：**正在审核中的更改**，正式版 `Hobgoblin 2.3.2 (13)`，开始全面发布。自管式发布关闭，审核通过后自动发布；当前尚未验证上线。两项非阻断提醒是缺少去混淆文件和原生调试符号。

AAB SHA-256：`b3a8ceca103991f3d0ac1c9cd504d84856c57bbfd5c3ce636ce3b35c6a919161`。完整制品与提交证据位于本地 Compass 的 `release/google-play/com.mrongm.hobgoblin/2.3.2/submission-evidence.json`。本次未涉及数据库变更。

## 关键备注

- 发布状态记录于 2026-10-07；送审成功不代表审核通过或已经上线。
- AAB 位于 `android/app/build/outputs/compass/`，是本机构建输出，不纳入 Git。密钥与密码仅存于 Compass 被忽略的私有目录，不复制到应用仓库。
- 不复用文件选择器中的历史目录；上传前核对完整 AAB 路径，上传后核对 Console 解析出的包名和版本。
- 新环境需重新创建 `GooglePlayCompass` 软链；通用流程参见 `GooglePlayCompass/docs/guides/automated-release.md`。
- Android 641 个单元测试、Debug 构建、根项目类型检查与架构检查通过；Vitest 4723 个通过、17 个跳过。模拟器验证中英文下载入口、GitHub 跳转和返回设置页；从 Release AAB 生成的 APK 安装与启动成功。
