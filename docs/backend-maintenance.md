# 后端定时清理与活跃时间写入

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

## 验证与部署边界

- 本地不连库验证：`pnpm --filter backend typecheck`；在 `packages/backend` 运行 `node jest.js --config jest.config.unit.cjs --runInBand --runTestsByPath test/unit/AgentSessionCleanupService.ts test/unit/UserService.ts`。
- 迁移必须由部署者执行。生产 Docker 的 `MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY=1` 启用并发建索引；索引构建中断后的 invalid 索引可重跑修复；事务内 revert 不使用 `CONCURRENTLY`。
- 单测覆盖调用顺序、SQL 生成及 Redis 去重边界，不替代真实 PostgreSQL 并发验收。上线后对照慢查询频次与执行计划确认实际改善，不能用静态检查声称生产耗时已经下降。
