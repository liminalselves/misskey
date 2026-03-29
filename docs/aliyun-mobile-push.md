# 阿里云移动推送（原生 App）— 服务端说明

本 fork 在 Misskey 中增加了**原生客户端**（如阈界人格 App）通过**阿里云移动推送 OpenAPI** 接收通知的能力，与现有 **Web Push / Service Worker** 并行；浏览器端逻辑不变。

## 管理员配置（推荐）

1. 部署或升级后执行数据库迁移（见下文「数据库」）。
2. 使用**管理员账号**登录 Web，打开 **控制面板 → 设置**（路径：`/admin/settings`）。
3. 在 **「阿里云移动推送（原生 App）」** 折叠区块中填写：
   - **AccessKey ID / AccessKey Secret**：在阿里云 RAM 创建**子用户**，授予调用移动推送 OpenAPI 所需权限后，使用该子用户的密钥（勿长期暴露主账号密钥）。
   - **EMAS AppKey**：与移动应用侧 **EMAS / 移动推送控制台** 中该应用的 **AppKey** 一致；须与 Android 工程 `android/app/src/main/assets/aliyun-emas-services.json` 内 **`emas.appKey`**（或控制台展示的同一字段）相同。
4. 保存后，运行中的 `MiMeta` 会通过内部 `metaUpdated` 事件更新，一般**无需重启**进程即可用于后续推送。

> **说明**：上述三项均保存在数据库表 **`meta`** 中，**不再**从服务器 `default.yml` 读取（历史示例已从 `.config/example.yml` 删除）。

## 数据库

迁移文件：`packages/backend/migration/1770600000000-AddAliyunMobilePushMeta.js`  

为 `meta` 表增加列：

- `aliyunMobilePushAccessKeyId`（varchar 1024，可空）
- `aliyunMobilePushAccessKeySecret`（varchar 1024，可空）
- `aliyunMobilePushAppKey`（varchar 64，可空）

升级命令（与常规 Misskey 一致）：

```bash
pnpm migrate
```

## 后端与 API 概要

- **发送逻辑**：`packages/backend/src/core/AliyunMobilePushService.ts`  
  从注入的 `DI.meta`（`MiMeta`）读取上述三字段；三者齐全时构造 POP SDK 客户端并调用阿里云 `Push` 接口。
- **触发点**：`PushNotificationService` 在向下游投递时同时调用 `AliyunMobilePushService.deliver`（与 Web Push 等并存）。
- **设备注册**：客户端通过 API（如 `mobile-push/register`、`mobile-push/unregister`）上报 `deviceId` 与平台，服务端写入 `mobile_push_device` 表；具体路径以 `packages/backend/src/server/api/` 下 endpoint 注册为准。

## 安全与运维提示

- **管理后台 `admin/meta`** 会返回完整密钥字段，仅限管理员；请勿对非管理员暴露。
- **`admin/update-meta`** 的审计日志会记录变更前后的 meta，敏感字段可能出现在 moderation log 中，与 SMTP 密码等现有行为一致。
- 清空某一输入框并保存会将对应列置为 `null`，即**关闭**该字段依赖的能力；若仅修改 AccessKey ID，请保留 Secret 一栏原有内容再保存。

## 客户端仓库

Flutter / Android 侧放置 `aliyun-emas-services.json`、Gradle 与 MethodChannel 等说明，见独立客户端仓库（如 **liminalselves**）内的 `README.md` 与 `android/app/src/main/assets/README.txt`。

## i18n 开发备忘

新增 `locales/*.yml` 键后，在仓库根目录执行：

```bash
pnpm --filter i18n generate
pnpm --filter i18n build
```

Windows 下已修复 `generateLocaleInterface.ts` 的入口检测，详见 `CHANGELOG.md`（2026.1.0 → General）。
