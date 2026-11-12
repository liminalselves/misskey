# 文档索引

本目录只放长期有效的契约和操作说明。根目录仅保留 README、CHANGELOG、LICENSE/COPYING、CONTRIBUTING、SECURITY、CODE_OF_CONDUCT 和 CLAUDE.md。开发过程记录、一次性审查报告和设计草稿不入库；有长期价值的结论并入下表对应文档。

## 工程与发布

| 文档 | 内容 |
| --- | --- |
| [ci-checklist.md](ci-checklist.md) | 按改动类型选择本地检查与 CI 验收、数据库边界、迁移与 SDK 类型规则 |
| [releasing.md](releasing.md) | 版本号、发布 tag、ACR/GHCR 镜像与发布、撤回、Hotfix 顺序 |
| [upstream-sync-2026.10.0.md](upstream-sync-2026.10.0.md) | 2026.10.0 上游同步的取舍、新增迁移与部署差异 |

## 后端与智能体

| 文档 | 内容 |
| --- | --- |
| [backend-maintenance.md](backend-maintenance.md) | 会话写入与资源删除、压缩便签、未读、额度签到、正则执行、定时维护契约 |
| [agent-external-audit.md](agent-external-audit.md) | 外审模型类型、请求格式与 Provider 配置 |
| [agent-model-announcements.md](agent-model-announcements.md) | 模型更新公告的生成、已读与展示契约 |
| [agent-credit-grants.md](agent-credit-grants.md) | 额度批量签发/补偿接口与前端入口 |
| [agent-control-embed.md](agent-control-embed.md) | 托管控制台嵌入：面板、握手、origin 与令牌约束 |
| [aliyun-mobile-push.md](aliyun-mobile-push.md) | 原生 App 阿里云移动推送的服务端配置 |

## 前端

| 文档 | 内容 |
| --- | --- |
| [mobile-navigation.md](mobile-navigation.md) | 移动端导航、缓存、滚动分页契约与真机验收清单 |
