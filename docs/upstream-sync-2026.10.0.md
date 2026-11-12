# 上游 2026.10.0 同步记录

记录同步时的取舍和仍然有效的部署差异。验证命令以 [CI 检查清单](ci-checklist.md) 为准，不在此重复。

## 基线

- 正式上游基线：`de89118a22`「Release: 2026.10.0」，同步合入提交 `343107b2bb`。
- 取舍顺序：保留 fork 功能；选择更合用的实现；同等条件选择较新实现。
- 441 个既有迁移与 fork 已发布更新日志逐字保持不变。
- 本地验证用 Node 22.23.1；项目和 Docker 要求已修补的 Node 22.23.4。

## 关键取舍

### 工具链与依赖

- 采用上游 Rolldown、Vite 8、Vitest 4、Vue 3.5.42、TypeORM 1.1.0。
- 保留阿里云推送、Google GenAI、S3 预签名、cron-parser、分词器及 Markdown 等业务依赖；sharp 0.35.5、ws 8.22.0 保留 fork 的较新版本，不随官方稳定版降级。
- TypeORM 1 已移除 find options 的数组投影与关联写法，fork 查询改为对象写法，不用类型强转掩盖。自有 Jest 用例迁到 Vitest，保留原断言与离线仓储桩。

### 业务与界面

- 保留智能体对话、生图、额度与签到、外审、治理、公告、会话审查及 App 推送的读写边界。
- 采用上游统一媒体查看器 MkLightbox；保留已清理文件占位、封禁图片限制、原图按需加载，以及经授权端点下载并保留文件名的行为。
- 角色策略采用共享编辑器，同时补入 fork 的三个生图空间策略，保留角色签到倍率。
- 保留移动导航缓存、未读定位、滚动快照、动态开发端口、公开 HMR 与 App 主题颜色同步；吸收上游更及时的滚动锚点捕获和生命周期清理。
- 旧的 2025.4 设置迁移已无调用方，随上游删除。

### 构建与工程

- 新打包器会把语言对象与其他导出放在同一代码块而内联失败：只移除被内联的语言导入，保留其他导出，并支持直接读取语言字典。
- API 元数据导出 CLI 写完文件后必须退出：模块级缓存的 GC 定时器改为 `unref`，导出 CLI 在写入完成或报错后显式退出。回归见 `packages/backend/test/unit/GenerateApiJson.ts`。
- 修复媒体查看器和通知页失效的 CSS 类引用，以及 CSS modules 中不能生效的 deep 选择器。
- 生产镜像只通过 fork 的版本 tag 发布，不恢复 develop 镜像通道。
- 表情资源改由上游 npm 资源包提供，构建不再调用 Git 子模块；Docker 排除 `.git` 和内部工作区的 `node_modules`，保留分词器预置与并发索引环境变量。
- 保留 fork 的 Helm 模板与数据库凭据分离（上游已移除预览部署目录）。
- 未采用上游自动启用个人插件的配置。

### 诊断 CI

后端旧版输出 `built/boot/entry.js` 且缺少内存/堆快照 IPC，前端旧版不生成 visualizer 统计文件。`scripts/check-diagnostics-baseline.mjs` 在安装和构建 base 前检查所需能力：

- base 不支持时只跳过 base 构建与双边测量，报告标为 **N/A** 并列出缺失能力；head 的冻结安装和生产构建仍执行。
- 配置损坏、路径错误、报告写入失败、构建或测量失败仍报错，不转成 N/A，不加 `continue-on-error`。
- 后端 base 固定到 PR 的 base SHA。

## 同步带入的迁移

保持上游原文件及时间戳，不重排、不修改历史迁移：

1. `1766652173085-add-category-to-avatar-decorations.js`
2. `1780059833698-NoteIdIndexForPinAndFavorite.js`
3. `1780488454126-sensitiveMediaDetectionExternalService.js`
4. `1782581064131-urlPreviewSensitiveList.js`
5. `1784899839024-HashtagTableDefaults.js`

## 部署差异

- **敏感图片检测外置。** 站点若启用该功能，需要部署 sensitive-detector 并配置 URL/凭据；未配置外部服务时不能当作仍有内置检测。
- **实库与镜像。** 迁移需在隔离测试库验证后再用于生产；多架构镜像构建与 Dockle 以 GitHub 工作流为准。
- **工具警告。** Storybook 8/10 及其主题插件存在 peer 范围混用，部分工具声明仅支持 TypeScript 5，未加忽略规则隐藏；Vite 的 native config loader 迁移提示仍保留。

## 已知检查限制

- 通用 `check-shipping` 在 Windows 上因命令长度上限无法一次 lint 大批量文件，改用包级 lint；其 locale 闸口不区分上游翻译同步与手工改词条，同步中不回退翻译来绕过。
- 三语言相对共同祖先新增的 fork 词条均保留：日语 1,170、英语 1,135、简体中文 1,174，缺失为 0。
- 后端根目录 Rolldown/Vitest 配置不在其 typed ESLint 的 TS project 中；上游原样的 Storybook、Vite 插件、构建脚本及部分测试存在格式或规则旧账，不属于 fork 回归，未做整批清理。
