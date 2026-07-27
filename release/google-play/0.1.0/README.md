# Hobgoblin Android 0.1.0 Google Play 首发资料

## 发布身份

| 字段 | 值 |
| --- | --- |
| 应用名称 | `Hobgoblin` |
| applicationId | `com.mrongm.hobgoblin` |
| versionCode | `1` |
| versionName | `0.1.0` |
| minSdk | `26` |
| targetSdk | `37` |
| 开发者 | `MRongM` |
| 联系邮箱 | `jiangisright@gmail.com` |
| 分类 | Productivity |
| 价格与广告 | 免费、无广告、无应用内购买 |
| 目标受众 | 18 岁及以上，不面向儿童 |

## 隐私政策

- 应用内与 Play Console 的稳定入口：<https://mrongm.github.io/hobgoblin/privacy/>
- 英文：<https://mrongm.github.io/hobgoblin/privacy/>
- 简体中文：<https://mrongm.github.io/hobgoblin/privacy/zh-cn.html>
- 日文：<https://mrongm.github.io/hobgoblin/privacy/ja.html>
- 韩文：<https://mrongm.github.io/hobgoblin/privacy/ko.html>

这些 URL 只有在本仓库 `docs/**` 通过现有 GitHub Pages 工作流发布后才可用于提交审核。提交前必须用无登录浏览器逐一打开验证。

## 目录

- `store-listing/`：四种语言的标题、短描述、完整描述与截图顺序。
- `release-notes/`：四种语言的首发说明。
- `app-content.md`：Play Console“应用内容”推荐答案。
- `data-safety.md`：数据安全表单答案及代码证据。
- `foreground-service-declaration.md`：`specialUse` 前台服务声明和演示视频脚本。
- `review-access.md`：审核用 SSH 访问资料的安全交接要求。
- `graphics/`：商店图标、宣传横幅、截图与校验清单。

## 构建产物

本地 Release AAB 的预期路径：

```text
android/app/build/outputs/bundle/release/app-release.aab
```

当前工程未在仓库中配置发布签名。生成的 Release AAB 必须先检查签名状态；若为未签名，需使用 Play 上传密钥在安全的本地环境签名后才能上传。密钥、口令和 Play 服务账号不得写入本目录或 Git。

### 2026-07-27 本地构建校验

| 检查项 | 结果 |
| --- | --- |
| AAB | `android/app/build/outputs/bundle/release/app-release.aab`（20,615,640 bytes） |
| SHA-256 | `1f653df96577927b891db60b088da1b9a82322bbaa331862828d392d477b39dc` |
| 签名状态 | 未签名；未自动生成或使用任何密钥 |
| 清单身份 | `com.mrongm.hobgoblin` / `versionCode 1` / `versionName 0.1.0` |
| SDK | `minSdk 26` / `targetSdk 37` |
| 权限 | Internet、前台服务及其 special-use 类型、通知、可选 Termux 命令集成 |
| 仓库质量门禁 | TypeScript 类型检查、测试、架构检查通过 |
| Android 质量门禁 | 单元测试、Lint、Release Bundle 构建通过 |
| 发布资料校验 | 5 个隐私页面、4 个商店语言、17 个图片资源通过 |

以上记录只描述本地生成物；上传前仍需使用最终上传密钥签名，并以 Play Console 的解析结果为准。

## 上传顺序

1. 在 Play Console 创建应用，选择应用、免费、默认语言英语（美国）。
2. 填写商店设置、联系邮箱、分类和四语商店文案。
3. 发布并验证隐私政策网页，再填写 Play Console 隐私政策 URL。
4. 完成 `app-content.md`、`data-safety.md` 和 `foreground-service-declaration.md` 中的声明。
5. 将长期可用且可重复使用的审核 SSH 资料直接填写到 Play Console，不写入仓库。
6. 上传图标、宣传横幅和已验证的真实应用截图。
7. 上传使用正确 Play 上传密钥签名的 AAB，确认 Console 解析为版本代码 `1`。
8. 先发布到内部测试，再完成所需的封闭测试、生产访问申请和正式审核。

## 仍需人工授权或外部资源

- 公开发布 GitHub Pages 隐私政策。
- 准备稳定的审核专用 SSH 主机、身份和远程演示仓库。
- 录制并托管前台服务演示视频。
- 选择或生成 Google Play 上传密钥并安全保存。
- 在 Play Console 上传、提交审核或正式发布。
- 若个人开发者账号创建于 2023-11-13 之后，完成至少 12 名测试者连续 14 天加入的封闭测试，并申请生产访问权限。

## 验证命令

```bash
bash scripts/google-play/validate-privacy-pages.sh
bash scripts/google-play/validate-release-copy.sh release/google-play/0.1.0
bash scripts/google-play/validate-release-assets.sh release/google-play/0.1.0/graphics
cd android && ./gradlew testDebugUnitTest lintDebug bundleRelease
```

本资料不执行 Git 提交、标签、推送、签名、上传、提交审核或生产发布。
