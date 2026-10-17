# 后端维护与数据一致性

## 智能体空会话清理

实现：`packages/backend/src/daemons/AgentSessionCleanupService.ts`。

每 15 分钟检查一次，每轮最多删除 500 个会话。只有创建超过 6 小时、未生成回复，并且没有消息，或仅有一条距离会话创建时间不超过 2 分钟的 assistant 开场白，才允许删除。用户消息、system 消息、两条以上消息和非开场白 assistant 消息均保留。

候选查询最多读取两条消息判断数量，不完整计数；开场白条件直接参与候选筛选，避免不符合删除条件的会话占满批次。迁移 `1784400000000-AgentSessionCleanupIndex.js` 添加 `(createdAt, id)` 索引，实体同步声明。不把 `agentReplyPending` 放入索引条件，避免每次开始/结束回复都维护该索引。

删除使用短 `READ COMMITTED` 事务：按 id 排序取得会话 `FOR UPDATE SKIP LOCKED` 行锁，重新检查时间和生成状态；随后在新语句中重新检查消息，再删除会话。已有 `FK_agent_message_session` 阻止锁定期间并发插入消息，并级联删除已确认可清理的消息。不得退回“先查候选，再按 id 无条件分两次删除消息/会话”的方式。

锁与快照依据：[PostgreSQL 行锁冲突表](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)、[READ COMMITTED](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-READ-COMMITTED)、[外键检查的 FOR KEY SHARE 实现](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/utils/adt/ri_triggers.c)。

## 用户活跃时间

实现：`packages/backend/src/core/UserService.ts`；调用入口：`StreamingApiServerService.ts`。

每条 WebSocket 仍保持 30 秒心跳。数据库活跃时间写入通过现有 Redis 的 `SET PX 30000 NX` 按用户合并，同一用户的多页面、多设备和多个 worker 共用一个写入窗口。写入失败时仅释放自己的随机 token，不删除已过期后被其他 worker 取得的新 token；下一次调用可重试。

Redis 在线状态、连接计数、离线推送判断和用户休眠唤醒逻辑保持原有职责。不能把数据库写入节流直接套到在线心跳上。

## 表情包批量描述任务状态

实现：`packages/backend/src/core/AgentStickerService.ts`（启动/轮询端点：`admin/emoji/generate-agent-descriptions`、`admin/emoji/agent-description-status`）。

运行状态存 Redis（`agentStickerBatchFill:lock` / `agentStickerBatchFill:state`），供不同 HTTP worker 共享。锁使用随机 token，以 `SET NX EX 300` 取得；每项开始前经 Lua 核对归属、发布进度并续期，失去锁或 Redis 报错时不开始下一项。释放和最终状态写入也核对 token，过期的旧 runner 不能覆盖新任务。已在途的模型调用不会因失去锁自动取消。state 保存 total/done/failed，结束后保留 1 小时；running 需状态 token 与锁 token 一致。崩溃且不再续期时，锁最多 5 分钟过期。

## 会话写入与资源删除

`agents/messages/send` 用条件 UPDATE 原子取得回复占位；`agents/_with-agent-lock.ts` 的 `withWritableAgentSession` 供导入、回滚、编辑、删除消息和删除会话使用，在短事务内锁定会话、检查属主并重检 pending。LLM、外审和记忆检索不在事务内等待。更新只写本次修改的列，不保存旧的整行会话快照。`sessions/show` 的自愈预算见 [外审文档](agent-external-audit.md)。

角色和文风的 session 外键是 CASCADE；删除资源必须在既有资源锁内检查任何会话引用，存在引用时拒绝删除并提示下架。此限制包括作者自己的会话，不是只保护他人的会话。

## 会话导入配置

前端导入配置调用 `agents/sessions/update` 并传 `importSettings: true`；后端沿用实际使用时的文风权限和模型可用性校验，一次返回 `defaultedFields`。已删除、下架、不可订阅使用的文风，以及失效的对话/压缩/BYOK/视觉/生图模型，不阻断导入，而是将对应引用明确重置为 `null`，不能省略字段后保留目标会话旧值。有效引用和文件中未提供的字段不变；普通设置更新仍严格报错，格式错误和非资源可用性错误不吞掉。

默认含义沿用现有会话约定：文风和广场统计文风为无；对话、压缩、视觉模型跟随站点默认；生图模型为关闭。失效画师预设移除会话覆盖，使用模型/站点默认预设。站点当前没有可用默认模型也允许导入历史，不代表模型调用已可用。前端完成弹窗逐项列出恢复默认的配置；配置已应用但后续消息或资源导入失败时，错误提示仍保留该清单。

## 压缩便签与消息历史

便签注入上限独立存于会话 `agentCompressionInjectMaxChars`（默认 4000，范围 200～50000），记忆页便签区单独保存；预算、区带总览与发信注入均使用该字段。阿里云仍使用 `agentLongMemoryInjectMaxChars` 与站点回退，切换记忆方式不互相覆盖。用户及审查页的会话读取和 v7 导出携带两项，导入分别校验。迁移 `1784600000000-AgentCompressionInjectLimit.js` 为当前便签会话回填原上限，其他及新会话使用默认值；必须先迁移再运行新版后端，助手不执行迁移。

注入只取 active、摘要非空且无未修正错误的便签，按 `sortIndex`、id 顺序拼接为整段文本；XML 转义后计量（含分隔符），超限裁掉开头、保留末尾，裁点不切开转义实体或 UTF-16 代理对。无需能解析原文边界，手动添加、导入及原消息已删的独立便签仍参与注入。`computeCompressionInjectText` 是发信与用户/审查总览 `injectionPreview` 的共同口径。

发信只排除实际注入便签中边界可解析的原文区间；整条被裁掉的便签不排除原文，但仍受历史窗口限制。首条部分保留的摘要也算已注入，并接管其完整区间；这仍是有损压缩，不保证完整保留该区间的全部信息。

自动压缩从最旧侧按完整格式化消息分批，角色前缀、时间/图片描述等格式化内容和分隔符均计入站点 `agentCompressionMaxInputChars`。单条消息独自超限时完整发送该条，输入上限是批预算软约束；不再截断输入后声称覆盖完整消息。`from/toMessageId` 和 SHA256 只按本批实际输入生成；未发送消息仅在后续仍满足区带触发条件时续压，不保证自动补齐所有历史积压。

`AgentCompressionMemoryService` 在 LLM 返回后取得会话行锁，重读本批源消息并核对条数、格式化内容 SHA256 和时间感知设置；历史已变更或会话已删除则丢弃旧结果。失败摘要的重试只更新仍为 failed、非用户改写且同指纹的行。状态、文本和排序使用窄列更新，不复活已删除的便签。

编辑、删除和回滚消息经 `messages/_invalidate-compression.ts` 将自动摘要标记 stale 并清除 sourceFingerprint；用户改写摘要是独立内容，不随缓存失效删除。替换历史导入删除全部旧便签，因为消息边界已被替换。

## 未读状态

`ChatService`、`AgentMessageNotifyService` 使用 Redis MULTI 同步 marker、firstUnread、count 与聚合集合。read-all 只移除本次读取的集合成员，不能删除整个集合，以免抹掉并发的新对话。

删消息后通过 `misc/reconcile-unread.ts` 重查仍存在的未读消息，用 Lua 对三个 Redis 快照值做 compare-and-set；被新消息或已读操作改变则重试。缺少旧数据的 first/count 时保留未知计数，不虚构已读状态。会话删除清除该会话三键及集合成员。前端先抓未读快照再发 read，审查模式不发 read；前端协议仍以项目规范的未读章节为准。

## 额度与签到

`AgentModelUsageService` 按次计费始终使用 `costPerCall`，成功与中断均不应用高峰倍率。`peakPriceMultiplier` 仅用于按量计费（含用量缺失时的按次兜底价），在结算时刻处于北京时间 09:00–12:00、14:00–18:00 时生效。按次配置即使保留旧倍率也不影响扣费。

兑换码认领与余额入账、奖励流水与入账、模型 pending 流水终结与扣费分别在同一数据库事务。模型流水只在事务提交后修改调用方对象；事务失败或重复结算补偿本次免费额度，Redis INCR 与 TTL 经 Lua 原子执行。保留允许负余额的既有规则；Redis 与 PostgreSQL 之间仍不是分布式事务，进程崩溃窗口不能由离线单测消除。

普通签到、补签和奖励流水同事务；同一用户补签通过 user_profile 行锁序列化月度次数检查。管理员撤销先用 DELETE RETURNING 取得实际撤销的签到，再在同事务撤销奖励与原流水，避免按旧查询结果重复扣减。日期必须能往返为同一个有效公历日期，不能让 `2026-02-30` 自动归一为三月。

`agents/_billing-logs.ts` 在 SQL 内 UNION 用量和兑换，统一筛选、稳定排序、计数和分页；PostgreSQL numeric 的原始结果显式转 number。签到治理汇总保持全历史口径，重聚合缓存 5 分钟；因此写入后汇总可能延迟，明细不借此删掉历史记录。

## 正则与上游响应

角色正则保留 JavaScript `gu` 语义，在 Node worker_threads 或浏览器 Worker 中按批次编译一次。后端默认 2 秒，超时抛明确 API 错误；浏览器默认 1 秒，失败回退原文。浏览器过滤未完成时不先闪出被隐藏文本，流式消息可保留上一版已过滤文本。Worker 终止会结算待处理调用，下一批重建；服务释放不得遗留 pending promise。

上游请求复用 `assertSafeLlmHttpsUrl`、`readBodyWithLimit` 并禁止重定向。外审响应预算见 [外审文档](agent-external-audit.md)。生成图片在大小、MIME 检测后经 sharp 实际解码，不能仅靠 base64 字符集或 metadata 认定有效；当前不声称检查了动画全部帧。

图片封禁两张数据库表同事务更新，S3 ACL 在事务外改动并在失败时补偿，补偿失败记日志。它不构成跨存储事务，也未串行化所有并发 ACL 操作。

## 验证与部署边界

- 本地不连库验证：`pnpm --filter backend typecheck`；在 `packages/backend` 运行 `node jest.js --config jest.config.unit.cjs --runInBand --runTestsByPath test/unit/AgentSessionCleanupService.ts test/unit/UserService.ts`。
- 迁移必须由部署者执行。生产 Docker 的 `MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY=1` 启用并发建索引；索引构建中断后的 invalid 索引可重跑修复；事务内 revert 不使用 `CONCURRENTLY`。
- 单测覆盖调用顺序、SQL 生成及 Redis 去重边界，不替代真实 PostgreSQL 并发验收。上线后对照慢查询频次与执行计划确认实际改善，不能用静态检查声称生产耗时已经下降。
