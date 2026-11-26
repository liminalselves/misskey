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

会话引用的文风在发送时失效（作者下架使 `publishedVersion` 清空、或行缺失）：`agents/messages/send` 预检查把 `session.dialogueStyleId` 原子清为 null（条件 UPDATE 带当前值做乐观判据，不清广场统计快照 `plazaStatsDialogueStyleId`），随后抛 `STYLE_NOT_AVAILABLE`；前端不再走模型失败弹窗，而是清本地文风状态、提示文风已不可用并跳到文风 tab。主动消息路径走同一 `assertCanUseDialogueStyle` 闸口并做同样清理，防止下架文风继续消耗用户额度；`context-window` 等读路径不写库，失败由前端静默兜底。

角色更新仅对新增的默认生图参考图校验属主、图片类型和每张 ≤5 MiB；在角色行锁内以当前草稿引用作比较，既有引用原样保留或移除均不重验，避免网盘清理后阻断角色其他字段的保存。创建角色仍校验全部参考图；失效图片在生图读取时跳过，不自动删除角色引用。角色编辑页的保存错误须显示弹窗并保留未保存状态。

## 会话导入配置

前端导入配置调用 `agents/sessions/update` 并传 `importSettings: true`；后端沿用实际使用时的文风权限和模型可用性校验，一次返回 `defaultedFields`。已删除、下架、不可订阅使用的文风，以及失效的对话/压缩/BYOK/视觉/生图模型，不阻断导入，而是将对应引用明确重置为 `null`，不能省略字段后保留目标会话旧值。有效引用和文件中未提供的字段不变；普通设置更新仍严格报错，格式错误和非资源可用性错误不吞掉。

默认含义沿用现有会话约定：文风和广场统计文风为无；对话、压缩、视觉模型跟随站点默认；生图模型为关闭。失效画师预设移除会话覆盖，使用模型/站点默认预设。站点当前没有可用默认模型也允许导入历史，不代表模型调用已可用。前端完成弹窗逐项列出恢复默认的配置；配置已应用但后续消息或资源导入失败时，错误提示仍保留该清单。

## Token 计数与上下文预算

- 计费、用量报表和导出只采用上游响应 `usage`，不使用本地分词结果。上下文预算统一使用 `o200k_base`；它是本站的内部计算单位，不代表各供应商的真实 Token 数。
- 官方模型与 BYOK 不再读取每模型 `tokenizerEncoding` / `charsPerToken`。旧分词器实现和历史存储字段保留，但不参与运行；管理端和 BYOK 表单不再提交这些配置。词表加载（`misc/agent-custom-tokenizers.ts`）、管理端点 `admin/agents/tokenizer-status`、Dockerfile 的 GLM/DeepSeek 词表预置参数和 `scripts/convert-hf-tokenizer-to-tiktoken.mjs` 同样保留；管理页不再调用该端点，也不显示词表缺失告警，重新启用每模型编码时一并恢复。
- 已知文本（系统提示、规则、协议、历史正文、指令）按 o200k 计数。尚未生成的回复使用 `maxOutputTokensPerCall` 预留；记忆内容采用固定预留槽，实际注入再按 o200k 裁剪到槽内。便签和记忆检索的字符上限仍是内容限制，不用于推导每模型 Token 比率。
- 普通回复、主动消息、上下文窗口和压缩预览共用 `buildSendPathBudgets`。最终发送前 `fitAgentPromptToTokenBudget` 再按包装后的实际文本排除最旧历史；必需内容本身超限时返回 `AGENTS_CONTEXT_BUDGET_EXCEEDED`，不截断当前用户输入。
- 精确超窗后，该条及更旧消息永久确定为窗外；展示用的字符估算不得改变窗口成员、区带或便签状态。零预算不伪造最新一条在窗内。

## 压缩便签与消息历史

便签注入上限是站点配置 `meta.agentCompressionInjectMaxChars`（默认 4000，范围 200～50000），仅由管理员在「控制面板 → 智能体管理 → 压缩」保存，统一作用于所有便签压缩会话。预算、实际注入和用户/审查只读预览均使用该值；用户会话不可覆盖，读取和导出不将其作为会话设置，导入不应用此项。阿里云 DashScope / Mem0 长期记忆已退役：服务、读写端点、云端节点管理、检索与写回均已移除，长期记忆只保留便签压缩。历史配置列暂留数据库但不再读取，待后续数据清理时单独处理。

迁移 `1784700000000-AgentCompressionInjectSiteSetting.js` 新增站点列并移除错误的会话列，以站点默认 4000 初始化，不将任一用户会话配置提升为全站设置。已提交的 `1784600000000` 保留迁移历史；部署须先完成待执行迁移链再启动新版后端，助手不执行迁移。

发信前按当前历史窗口在内存中重算 dormant/active，不依赖上轮压缩持久化的状态；任一源端点越窗或不可解析即 active，stale/failed 等状态不自动恢复。用户/审查总览也只投影状态，不写库。普通回复落库后重新扫描含本条 assistant 的最多 50000 条消息，重算一次 D 供压缩预判与执行共用；不复用回复前的扫描。

注入只取 active、摘要非空且无未修正错误的便签，按 `sortIndex`、id 顺序拼接为整段文本；XML 转义后计量（含分隔符），超限裁掉开头、保留末尾，裁点不切开转义实体或 UTF-16 代理对。无需能解析原文边界，手动添加、导入及原消息已删的独立便签仍参与注入。`computeCompressionInjectText` 是发信与用户/审查总览 `injectionPreview` 的共同口径。

普通、随机主动和定时主动消息共用压缩预算、注入及原文排除：只排除实际注入便签中边界可解析的原文区间；整条被裁掉的便签不排除原文，但仍受历史窗口限制。首条部分保留的摘要也算已注入，并接管其完整区间；这是有损压缩，不保证保留该区间全部信息。主动消息成功落库后也启动压缩，重新读取当前消息，不传回复前快照；压缩失败不撤销已交付回复。

自动压缩取最旧侧连续的未覆盖候选段，遇到已覆盖或非候选消息即结束本批，不以首尾区间声称覆盖中间未发送的原文。只有 active/dormant 且摘要可用的便签算已覆盖。角色前缀、时间、图片识别描述、控制块和分隔符均计入站点 `agentCompressionMaxInputChars`；纯图片消息也按完整格式化内容参与。单条独自超限时仍完整发送，输入上限是批预算软约束。`from/toMessageId` 和 SHA256 只按本批实际输入生成；未发送消息仅在后续仍满足区带条件时续压，不保证补齐所有历史积压。

空白模型摘要记为 failed 并按失败结算，不能阻止后续重试。`AgentCompressionMemoryService` 在 LLM 返回后取得会话行锁，重读本批源消息并核对条数、格式化内容 SHA256 和时间感知设置；历史已变更或会话已删除则丢弃旧结果。失败摘要及遗留自动空摘要的重试须匹配原状态、updatedAt、指纹和非用户改写条件。状态、文本和排序使用窄列更新，不复活已删除便签或覆盖并发编辑。

编辑、删除和回滚消息经 `messages/_invalidate-compression.ts` 仅将源区间与改动相交的自动摘要标记 stale、清除 sourceFingerprint；同内容保存不失效，删除/回滚须在删消息前解析边界。用户改写便签、无法解析边界的独立便签及无关区间均保留。替换历史导入仍删除全部旧便签，因为消息边界已被替换。

## 未读状态

`ChatService`、`AgentMessageNotifyService` 使用 Redis MULTI 同步 marker、firstUnread、count 与聚合集合。read-all 只移除本次读取的集合成员，不能删除整个集合，以免抹掉并发的新对话。

删消息后通过 `misc/reconcile-unread.ts` 重查仍存在的未读消息，用 Lua 对三个 Redis 快照值做 compare-and-set；被新消息或已读操作改变则重试。缺少旧数据的 first/count 时保留未知计数，不虚构已读状态。会话删除清除该会话三键及集合成员。前端先抓未读快照再发 read，审查模式不发 read；前端协议仍以项目规范的未读章节为准。

## 额度与签到

`AgentModelUsageService` 按次计费始终使用 `costPerCall`，成功与中断均不应用高峰倍率。`peakPriceMultiplier` 仅用于按量计费（含用量缺失时的按次兜底价），在结算时刻处于北京时间 09:00–12:00、14:00–18:00 时生效。按次配置即使保留旧倍率也不影响扣费。

兑换码认领与余额入账、模型 pending 流水终结与扣费分别在同一数据库事务。模型流水只在事务提交后修改调用方对象；事务失败或重复结算补偿本次免费额度，Redis INCR 与 TTL 经 Lua 原子执行。保留允许负余额的既有规则；Redis 与 PostgreSQL 之间仍不是分布式事务，进程崩溃窗口不能由离线单测消除。

批量奖励/补偿 `admin/agents/credits/issue-batch` 逐条独立事务入账并在提交后通知，补偿记录为 `admin_compensation`，模型调用统计须排除该类型。参数、部分成功与重试边界、旧奖励入口及原因扩容迁移见 [额度签发接口](agent-credit-grants.md)。

普通签到、补签与对应流水同事务；同一用户补签通过 user_profile 行锁序列化月度次数检查。管理员撤销先用 DELETE RETURNING 取得实际撤销的签到，再在同事务撤销奖励与原流水，避免按旧查询结果重复扣减。日期必须能往返为同一个有效公历日期，不能让 `2026-02-30` 自动归一为三月。

`agents/_billing-logs.ts` 在 SQL 内 UNION 用量和兑换，统一筛选、稳定排序、计数和分页；PostgreSQL numeric 的原始结果显式转 number。签到治理汇总保持全历史口径，重聚合缓存 5 分钟；因此写入后汇总可能延迟，明细不借此删掉历史记录。

## 正则与上游响应

角色正则保留 JavaScript `gu` 语义，在 Node worker_threads 或浏览器 Worker 中按批次编译一次。后端默认 2 秒，超时抛明确 API 错误；浏览器默认 1 秒，失败回退原文，过滤完成前不闪出隐藏文本，流式更新可保留上一版已过滤文本。浏览器发送前用 `deepClone` 去除请求中的嵌套 Vue Proxy；回归测试须实际经过结构化克隆。Worker 终止会结算待处理调用，创建失败或终止后下一批重建；服务释放不得遗留 pending promise。

上游请求复用 `assertSafeLlmHttpsUrl`、`readBodyWithLimit` 并禁止重定向。外审响应预算见 [外审文档](agent-external-audit.md)。生成图片在大小、MIME 检测后经 sharp 实际解码，不能仅靠 base64 字符集或 metadata 认定有效；当前不声称检查了动画全部帧。

图片封禁两张数据库表同事务更新，S3 ACL 在事务外改动并在失败时补偿，补偿失败记日志。它不构成跨存储事务，也未串行化所有并发 ACL 操作。

## 网盘对象丢失：上报 → 待审 → 管理员批量删除

实现：`core/DriveMissingObjectService.ts`，判定用纯函数在 `misc/drive-missing-object.ts`。对象存储里的原图被外部删除（如云厂商审查）而 `drive_file` 行还在时，访问上报只负责"发现并核实"，**不自动删任何数据**；确认缺失的文件进入待审表 `drive_missing_object_report`，由管理员在「控制面板 → 对象存储 → 丢失文件」审查后批量删除。原则：任何无法确认的情况都不动数据，删除永远是人工动作。

- 触发（匿名入口）：`/proxy/` 回源 404（`FileServerService`）或前端媒体 `error` 上报 `drive/files/report-missing`（30 次/分钟/IP；前端每页最多 30 次、间隔 ≥1.5s、同 URL 只报一次）。入口只传 URL，是否写入待审表由服务端独立核实，不信任调用方。
- 核实（`reportByUrl`）：提取候选 key 后走 `accessKey` / `thumbnailAccessKey` / `webpublicAccessKey` 唯一索引定位本地文件 → `resolveObjectLocation` 判定位置 → 带凭证 HEAD。明确 404/NoSuchKey 且当前桶金丝雀通过才写入/更新待审行（`reportCount` 累加、刷新时间）；对象存在则删除已有待审行（视为恢复）；403、5xx、超时、NoSuchBucket、鉴权失败一律视为"不确定"，不记录。防滥用：单文件核查冷却 30s，全站每分钟 HEAD 预算 120 次。
- 位置判定 `resolveObjectLocation`：URL 属于当前桶按当前桶；否则仅在**路径风格访问、主机与端口等于当前端点、`/<桶>/<accessKey>` 与记录 accessKey 完全一致**时按遗留桶处理（生产有 239 条 `aliya-misskey` 记录）。其余一律不处理。
- 待审表 `drive_missing_object_report`：`fileId` 唯一、外键级联（文件被删则行自动消失），存 bucket/objectKey/scope、reportCount、首次/最后上报时间、最后核实时间。migration `1785000000000`。
- 管理端点（`admin/drive/missing-reports/`，`requireModerator`）：`list`（页码分页，含属主 UserLite）、`recheck`（重新核实，恢复则移除、仍缺失则刷新核实时间）、`delete`（批量删除）。批量上限 100 条/次。
- 批量删除 `deleteReported`：整批先过端点健康检查（**对照池排除本批待处理文件**，否则整批缺失会被误判成存储不健康、永远删不掉），不可用则整批中止。每条用当前配置重新解析位置并 HEAD，**必须明确 404 才删**；对象存在则移除待审行；配置变更后无法解析的一律不动。逐条返回 deleted/present/unknown/gone。
- 修复落点 `DriveService.deleteFileWithMissingObject(file, moderator)`：重新读取并校验行未变（accessKey、url）后，**墓碑与删行同一事务**；不向对象存储发删除。头像/横幅外键被置空后同步清 `user` 上冗余 URL 列并发 `localUserUpdated`；传 moderator 时写 `deleteDriveFile` 审计日志（`logSafely`，失败不影响删除）。
- 通知：用 Misskey 自带 `app` 类型通知（`appAccessTokenId: null`），标题「网盘内容已被清理」，正文固定为"因相关审查原因，您网盘中的部分图片已被删除。"（本批含非图片时改说"文件"，复用 `buildMissingObjectNotice`），图标取站点图标。**每批每个用户只发一条**，在删除全部提交后发送，失败只记日志不回滚。
- 前端：`pages/admin/object-storage.vue` 两 tab（`?view` 路由同步），「丢失文件」组件 `components/MkDriveMissingReportsForAdmin.vue`——无省略号横向滚动表格（`display:contents` 行）、页码分页条（10/20/50）、桶筛选、本页全选、「重新核实选中」「删除选中」。删除前确认框写明数量与后果，结果汇总成一条提示并就地移除已处理行，不整表重载。
- SDK 错误形态（本地假 S3 + 真实 `@aws-sdk/client-s3` 实测）：HEAD 缺失 → `name: NotFound, status 404`；403 与 5xx → `name: Unknown`，状态码分别为 403/500，均判为"不确定"。**HEAD 的 404 没有响应体，SDK 无法区分"桶不存在"与"key 不存在"**：当前桶靠金丝雀兜底（桶不存在时金丝雀同样失败，整体"不确定"）。
- 生产现状（2026-11-08 只读核查）：25407 个对象存储本地文件中，当前桶 `yjrg-misskey` 25168 个，遗留桶 `aliya-misskey` 239 个；抽样 30 个遗留文件公网访问全部 404（`NoSuchKey`），抽样当前桶文件全部 200。这 239 条会随访问陆续进入待审表，由管理员决定是否批量删除，系统不会自动清理。
- 验证边界：单测用内存 Redis 与桩覆盖各分支，不替代真实 OSS 验收；对真实阿里云 OSS 的签名 HEAD 未验证。上线验收顺序：先 migrate → 访问一张已丢失的图，确认进入待审列表 → 重新核实、批量删除 → 在被删用户端看到通知与墓碑占位。

## 验证与部署边界

- 本地不连库验证：`pnpm --filter backend typecheck`；定向 Vitest 命令及数据库边界统一见 [CI 检查清单](ci-checklist.md)，清理与删用户的回归文件为 `test/unit/AgentSessionCleanupService.ts`、`test/unit/UserService.ts`。
- 迁移必须由部署者执行。生产 Docker 的 `MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY=1` 启用并发建索引；索引构建中断后的 invalid 索引可重跑修复；事务内 revert 不使用 `CONCURRENTLY`。
- 单测覆盖调用顺序、SQL 生成及 Redis 去重边界，不替代真实 PostgreSQL 并发验收。上线后对照慢查询频次与执行计划确认实际改善，不能用静态检查声称生产耗时已经下降。
