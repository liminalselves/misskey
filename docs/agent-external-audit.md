# 智能体外审模型

在管理端「智能体设置 → 外审」添加模型，填写 API Key 后保存。模型按优先级调用，沿用现有超时、失败切换、自动禁用和失败放行策略。

| 模型类型 | 请求端点 | 请求格式 |
| --- | --- | --- |
| OpenAI 兼容 | Base URL 自动追加 `/chat/completions`；已以 completions 结尾则原样使用 | `messages` |
| 阿里云百炼决策模型 | 完整端点，路径以 `/compatible-mode/v1/systemone` 结尾 | `state` 为审核文本字符串 |
| JEV 决策模型 | 完整端点，路径以 `/v1/systemone` 结尾 | `state` 为 `{ "用户侧": 用户内容, "模型侧": 模型回复 }` |

选择 JEV 时，空端点默认填入 `https://pool.futureppo.top/v1/systemone`，空上游模型名默认填入 `jev-1.13.0`。已有字段不会被覆盖，端点和模型名均可修改；密钥由管理员填写，不内置。

两个决策类型均使用 `questions.content_safety`，以启用的违规条目 ID 生成 `criteria`；`allow` 表示放行，`other_high_risk` 表示其他高风险。返回读取 `answers.content_safety.choice` 和 `confidence`，普通违规条目使用配置的固定原因。JEV 示例中的问题名和选项名是自定义键，不要求使用示例的中文名称。

模型类型白名单与端点规则分别维护在 `packages/backend/src/models/AgentExternalAuditProvider.ts` 和 `packages/backend/src/core/agent-external-audit-providers.ts`。新增类型须同步管理端选项、请求格式与解析；配置保存和健康统计使用后端白名单。不涉及新增数据库列，无需迁移。
