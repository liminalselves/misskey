# 智能体外审模型

在管理端「智能体设置 → 外审」添加模型，填写 API Key 后保存。模型按优先级调用，沿用现有超时、失败切换、自动禁用和失败放行策略。

| 模型类型 | 请求端点 | 请求格式 |
| --- | --- | --- |
| OpenAI 兼容 | Base URL 自动追加 `/chat/completions`；已以 completions 结尾则原样使用 | `messages` |
| 阿里云百炼决策模型 | 完整端点，路径以 `/compatible-mode/v1/systemone` 结尾 | `state` 为审核文本字符串 |
| JEV 决策模型 | 完整端点，路径以 `/v1/systemone` 结尾 | `state` 为 `{ "用户侧": 用户内容, "模型侧": 模型回复 }` |

选择 JEV 时，空端点默认填入 `https://pool.futureppo.top/v1/systemone`，空上游模型名默认填入 `jev-1.13.0`。已有字段不会被覆盖，端点和模型名均可修改；密钥由管理员填写，不内置。

两个决策类型均使用 `questions.content_safety`，以启用的违规条目 ID 生成 `criteria`；`allow` 表示放行，`other_high_risk` 表示其他高风险。返回读取 `answers.content_safety.choice` 和 `confidence`，普通违规条目使用配置的固定原因。JEV 示例中的问题名和选项名是自定义键，不要求使用示例的中文名称。

请求禁止重定向；完整响应体读取包含在单模型超时内，上限 2 MiB。失败仍按现有顺序切换模型或放行；`sessions/show` 的回复占位自愈阈值为 5 分钟基础预算加当前有效外审模型的串行超时总额，不能仅凭上一轮 assistant 消息解除本轮占位。

模型类型白名单与端点规则分别维护在 `packages/backend/src/models/AgentExternalAuditProvider.ts` 和 `packages/backend/src/core/agent-external-audit-providers.ts`。新增类型须同步管理端选项、请求格式与解析；配置保存和健康统计使用后端白名单。不涉及新增数据库列，无需迁移。

## 人工复审

- 展示按「用户 + 会话」分组：同一用户在不同会话的拦截各成一组（无会话的记录自成一组），明细上限 50 条也按组计算。组头提供「查看会话」；`blockCount`/`reviewUntilId` 为组内值，`userReviewUntilId` 为该用户全部会话的上界。「处理」默认只勾选本组会话（可补选其他会话），同时封禁用户时用 `userReviewUntilId` 清该用户全部证据；「忽略」传 `sessionId`（含 null）只忽略本组。
- 每条规则有统计范围 `scope`：`session`（默认）= 同一用户在同一会话内累计，只有达标的会话组进入复审；`user` = 同一用户跨会话合并计数，达标后该用户所有未审阅会话组都进入复审。缺省（含旧数据、缺字段）一律按会话处理，落库与 `admin/meta` 返回都归一化出显式 `scope`。
- 仅统计 `status = block` 且 `reviewIgnoredAt IS NULL` 的记录。每条启用规则独立判断：未审阅记录在任一历史时间窗口内达到阈值，即进入复审；不是累计总数达标，也不是查询时只看最近 N 分钟。任意一条规则达标即可，缺省 `enabled` 与设置页一致视为启用。
- 待复审记录与证据不会随时间流逝自动消失。列表保留该组全部未审阅拦截记录；封禁用户或会话本身不等于完成复审，仍展示封禁状态供管理员判断。完成状态统一由 `reviewIgnoredAt` 表示，沿用现有字段，无需迁移。
- 每组只返回最近 50 条明细（含文本），`blockCount` 仍是该组全部未审阅记录数；页面超出时提示“仅显示最近 N 条”。列表同时返回 `reviewUntilId`（该组被计入证据的最大记录 ID）作为操作上界。
- 「忽略」按 `userId + sessionId + untilId` 标记该组截至上界的全部未审阅拦截，不受明细条数限制；接口仍兼容按 `ids` 标记。「快捷处理」只封禁会话时，仅标记所选会话的记录；同时处置用户时标记该用户的记录。两者都受上界约束，操作期间新到的记录保持待复审。已审阅记录不再参与下次触发。
- 徽标「复审 N」与概览「待复审会话」统计待复审的会话组数，与列表共用同一资格查询。
- 进入复审 tab 时重新拉取；刷新失败保留原列表，首次失败展示错误与重试，不显示“暂无复审”。分页位置按原始返回条数推进，不能用去重后的条数代替。
- 离线回归：`packages/backend/test/unit/AgentExternalAuditReview.ts`、`packages/frontend/test/agents-review-list.test.ts`；真实数据库与生产案例的验收需另行执行，离线 SQL 构造测试不代表线上数据已核对。
