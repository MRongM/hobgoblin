# Google Play 应用内容填写建议

本文件依据 Hobgoblin Android 0.1.0 的代码与依赖整理。提交时应以 Play Console 当时显示的实际问题和最终上传 AAB 为准。

## 隐私政策

- 主 URL：<https://mrongm.github.io/hobgoblin/privacy/>
- 应用内入口：设置 → 隐私政策。
- 提交前验证：公开访问、无需登录、非 PDF、不可由访问者编辑、四种语言可达。

## 广告

回答：**否，应用不包含广告。**

证据：Android 依赖中没有广告 SDK；商店文案也不宣传广告支持的功能。

## 应用访问权限

回答：**全部或部分功能受限。**

原因：浏览设置和空状态不需要登录，但核心 SSH 诊断、远程 Git、终端和端口转发功能需要用户提供可访问的 SSH 主机与凭据。审核团队必须获得稳定、可重复使用、无地理限制、无一次性验证码的演示环境。按 `review-access.md` 将资料直接填写到 Play Console。

## 目标受众和内容

- 目标年龄组：**18 岁及以上**。
- 是否面向儿童：**否**。
- 商店分类：**Productivity**。
- 理由：该应用是管理 SSH 主机、远程 Git 工作树和终端会话的专业开发工具。

## 内容分级

按实际功能建议回答：

- 暴力、血腥、性、裸露、粗俗语言、管制物品、赌博：应用本身均不提供。
- 用户交流或内容交换：否；应用不运营社区、聊天、公开发布或内容托管服务。
- 位置共享：否。
- 数字商品购买或随机奖励：否。
- 用户控制的终端输出：来自用户自己的 SSH 主机，不由 MRongM 托管或分发。若问卷对通用用户生成内容有更宽泛定义，应按 Console 的说明诚实选择并保存解释。

## 账号与删除

- 应用是否创建 Hobgoblin 账号：**否**。
- 账号删除声明：**不适用**。
- 本地数据：可通过应用内删除控件、Android“清除存储”或卸载应用移除。
- MRongM 后端数据：不存在应用后端或服务器端 Hobgoblin 用户记录。

## 其他声明

- 新闻或杂志应用：否。
- 政府应用或代表政府机构：否。
- 健康应用：否。
- 金融功能：否。
- 约会应用：否。
- 广告 ID：不使用。
- COVID-19 接触通知或状态应用：否。

## 权限和 API

最终 AAB 应只包含以下清单权限：

- `android.permission.INTERNET`：连接用户指定的 SSH 主机。
- `android.permission.FOREGROUND_SERVICE`：维持用户启动的交互式 SSH 终端。
- `android.permission.FOREGROUND_SERVICE_SPECIAL_USE`：声明没有更精确标准类型的交互式 SSH 终端会话。
- `android.permission.POST_NOTIFICATIONS`：显示终端前台服务的持续通知；在需要时再请求。
- `com.termux.permission.RUN_COMMAND`：在用户明确选择时调用单独安装的 Termux。

应用不请求位置、联系人、短信、通话记录、相机、麦克风、全部文件访问或软件包全量查询权限。

## 前台服务

需要在“应用内容”中申报 `specialUse`。使用 `foreground-service-declaration.md` 的说明和视频脚本，不要把该服务描述为后台同步、周期任务或不可见远程控制。

## 加密与出口合规

应用使用 SSH 和 Android Keystore 支持的 AES-GCM。开发者应根据分发国家、Play Console 提示及自身所在地确认加密软件相关的出口或进口义务；本文件不替代法律意见。
