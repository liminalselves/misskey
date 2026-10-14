# 项目代码质量审查与修复闭环

日期：2026-10-10。实施基线：`develop` / `630f317074`。初次审查基线为 `3a814b07ec`，本记录以实施时实际代码纠正旧结论，不沿用旧行号。

## 结论与范围

原清单 64 个编号全部有处置结果：**55 项已修复，3 项已由当前实现解决，1 项误报，5 项明确保留设计**。这里的“已修复”表示代码已修改并完成下述相称的本地验证，不表示已部署或完成实库、跨进程、对象存储集成验收。

本次没有提交、推送、操作暂存区、部署、重启服务、连接开发/生产数据库或执行迁移；没有新增依赖。升级已有依赖、同步锁文件与冻结安装属于已批准范围。没有新增数据库结构或修改历史迁移。

审查覆盖安全、正确性、性能、可靠性、架构、可维护性、供应链、工程化与规范。重点修复内容授权、回复占位和历史修改、额度结算、未读重算、无界正则、分页与发布链；不以假想公网威胁扩大项目的权限或部署体系。

以下 P1–P3 是复核后的修改优先级，不是对旧报告严重性的照抄。没有证据支持一个尚未处理的 P0。工作量 S/M/L 分别表示局部修改、跨文件契约修改、跨模块或依赖/结构修改，不是精确工时。

### 验证标记

- **B**：最终后端源码、unit 和 federation 测试类型检查；变更源码 lint；SWC 构建。它们不执行 PostgreSQL SQL，也不证明数据库事务回滚。
- **J**：明确列出的离线 Jest 回归。使用模拟仓储/Redis，不导入 GlobalModule，不连接数据库；具体行为见测试文件。
- **F**：前端类型检查、变更源码 lint、Vitest 和生产构建。不是浏览器端到端或真机验收。
- **E**：依赖冻结安装、锁文件检查，或工作流 YAML/固定 SHA 静态检查。不是镜像发布或 GitHub CI 实跑。
- **I**：真实 `AgentImageService.storeGeneratedImage` 入库前闸口的离线运行；在存储工作之前截断，不操作数据库、文件或对象存储。
- **R1–R5**：文末尚未执行的运行验收组。标记 R 不代表失败，也不得将其写为已经通过。

## 64 项逐项处置

### 依赖、安全与数据入口（1–22）

### #1 sharp 依赖风险 — 已修复（P1，M）

旧 sharp 为 0.33.5。升级至 0.35.5，配套 sharp-read-bmp 1.3.1，并用根 override 清除图标工具链的旧嵌套 sharp；同步 ESM named type imports，不降回旧版绕过类型错误。

证据：[backend/package.json:168](../packages/backend/package.json#L168)、[根 override:90](../package.json#L90)、[ImageProcessingService.ts:7](../packages/backend/src/core/ImageProcessingService.ts#L7)。验证 B、E、I；完整图像上传链待 R3。官方依据见“依赖公告”。

### #2 ws 依赖风险 — 已修复（P1，S）

8.19.0 升至 8.22.0，覆盖当前 8.x 分支已核实的内存耗尽与未初始化内存披露修复；锁文件不保留旧直接版本。版本命中不等于已证实本实例可以匿名利用。

证据：[backend/package.json:180](../packages/backend/package.json#L180)、[pnpm-lock.yaml](../pnpm-lock.yaml)。验证 B、E；实际 WebSocket 连接待 R2。

### #3 任意文件下载签名 — 已修复（P1，M）

原端点仅凭 fileId 返回下载地址。现在允许属主、moderator 或当前用户可读内容的真实附件；拒绝孤立的他人文件，保留生图封禁。Note 复用可见性查询；聊天按消息读取权限，不因公开房间信息可读就放行历史附件。Page 正文仅认作者自己的 image 文件，头图按真实引用处理；不凭未执行的 Page visibility 字段额外收窄权限。

证据：[download-url.ts:73、99](../packages/backend/src/server/api/endpoints/drive/files/download-url.ts#L73)、[ChatService 消息权限](../packages/backend/src/core/ChatService.ts#L424)。验证 B、J 的 owner/content/unrelated/blocked 分支；真实 JSONPath 和各类内容权限待 R1。

### #4 安全 URL 校验后的重定向绕过 — 已修复（P1，M）

HTTPS/DNS 入口校验不能限制后续 302。生图、外审、Dashscope、识图和贴纸请求补 `redirect: 'error'`，复用现有 URL 校验，不创建第二套出站框架。

证据：[AgentImageService.ts:770、815](../packages/backend/src/core/AgentImageService.ts#L770)、[AgentExternalAuditService.ts:499](../packages/backend/src/core/AgentExternalAuditService.ts#L499)、[AgentDashscopeMemoryService.ts:104](../packages/backend/src/core/AgentDashscopeMemoryService.ts#L104)。验证 B 与调用点静态复核；真实跳转与 DNS 行为待 R3。

### #5 外审响应读体无界 — 已修复（P1，S）

计时器覆盖完整响应读取，不在仅收到响应头时解除；统一用 readBodyWithLimit 限制 2 MiB。Dashscope 读体同步有界。超时、失败切换与失败放行保留既有策略。

证据：[AgentExternalAuditService.ts:514–525](../packages/backend/src/core/AgentExternalAuditService.ts#L514)、[外审契约](agent-external-audit.md)。验证 B、J 的读体超限取消和 abort 传播；这些测试不是外审定时器集成证明，慢流待 R3。

### #6 Vite 依赖风险 — 已修复（P1，M）

四个 workspace 升至 7.3.6，超过官方 7.3.5 修复下限。7.3.7 未满项目 7 天 minimumReleaseAge，未设置例外绕过。Windows 文件拒绝规则绕过与 launch-editor 风险属于开发服务调用面，不宣称生产静态资源具有同样利用面。

证据：[backend/package.json:236](../packages/backend/package.json#L236)、[frontend](../packages/frontend/package.json)、[frontend-embed](../packages/frontend-embed/package.json)、[frontend-builder](../packages/frontend-builder/package.json)。验证 E、F；真实开发服务器路径行为待 R3。

### #7 Fastify 依赖风险 — 已修复（P1，M）

5.7.1 升至 5.12.5，覆盖已核实的 Content-Type/schema 校验和 HTTP/2 trailer 异常修复。适用性仍取决于协议、路由及 schema 用法，不将所有公告均描述为本实例已复现。

证据：[backend/package.json:119](../packages/backend/package.json#L119)、文末官方公告。验证 B、E；真实 HTTP 路由与 HTTP/2 行为待 R3。

### #8 删除角色/文风级联丢失会话 — 已修复（P1，M）

纠正旧结论：session 外键已是 CASCADE，不是“缺外键造成悬空 500”。在既有资源锁事务中检查任意会话引用，存在引用则拒绝删除、提示下架，包括作者自己的会话。

证据：[characters/delete.ts:36](../packages/backend/src/server/api/endpoints/agents/characters/delete.ts#L36)、[styles/delete.ts:36](../packages/backend/src/server/api/endpoints/agents/styles/delete.ts#L36)。验证 B、J 的引用守卫；并发新建会话与删除的真实外键锁待 R1。

### #9 导入历史与发送竞态 — 已修复（P1，M）

导入取得会话短行锁并重检 pending；替换消息、删除旧压缩便签、更新会话相关列同事务执行，不再保存旧的整行 session 快照。网络调用不持有事务。

证据：[withWritableAgentSession:19–24](../packages/backend/src/server/api/endpoints/agents/_with-agent-lock.ts#L19)、[import-context.ts:196–204](../packages/backend/src/server/api/endpoints/agents/messages/import-context.ts#L196)。验证 B、J 的锁后 pending/属主检查；真实 send/import 互斥待 R1。

### #10 管理员撤销签到并发与残留流水 — 已修复（P1，M）

DELETE RETURNING 只结算实际被本事务撤销的记录；奖励扣回、原签到流水删除与冲正记录同事务，避免两次撤销按旧查询结果双扣。

证据：[agents-checkin-revoke-today.ts:49–85](../packages/backend/src/server/api/endpoints/admin/agents-checkin-revoke-today.ts#L49)。验证 B、J 的签到服务回归与端点静态事务复核；实际撤销/重新签到竞态待 R1。

### #11 主线程无界角色正则 — 已修复（P1，L）

Node worker_threads 和浏览器 Worker 执行，整批编译一次；分别默认 2 秒、1 秒。保留完整 JavaScript gu 语义，不静默改用 RE2 丢失 lookbehind/backreference。后端超时显式报错并沿发送 finally 释放占位；前端失败回退原文，未完成时不先闪出隐藏内容。补初始化期间入队、postMessage 异常和 dispose 未结算 promise 的边界。

证据：[后端执行器:18、105、133](../packages/backend/src/core/agent-regex-filter.ts#L18)、[前端执行器](../packages/frontend/src/utility/agent-regex-filter.ts)、[Worker](../packages/frontend/src/workers/agent-regex-filter.ts)。验证 B、J、F，含真实灾难性回溯超时与正常规则；浏览器交互待 R4。

### #12 删除会话残留未读 — 已修复（P2，S）

删除会话与在途回复互斥；数据库删除成功后调用统一 readAgentMessages 清除该会话三键和集合成员。跨数据库/Redis 崩溃一致性不伪装成原子事务。

证据：[sessions/delete.ts:59–63](../packages/backend/src/server/api/endpoints/agents/sessions/delete.ts#L59)、[AgentMessageNotifyService.ts:60](../packages/backend/src/core/AgentMessageNotifyService.ts#L60)。验证 B；真实 Redis 状态待 R2。

### #13 sessions/show 误解除占位与旧快照覆盖 — 已修复（P1，M）

不再以最新 assistant 判断本轮已经完成。超时自愈按 id/pending/updatedAt 条件窄列更新；5 分钟基础预算额外计入有效外审模型串行超时总额，不覆盖并发设置或较新的占位。

证据：[sessions/show.ts:107–111](../packages/backend/src/server/api/endpoints/agents/sessions/show.ts#L107)、[getAuditTimeoutBudgetMs:248](../packages/backend/src/core/AgentExternalAuditService.ts#L248)。验证 B、静态条件/预算复核；配置变化和真实长请求待 R1、R3。

### #14 兑换认领与入账分离 — 已修复（P1，S）

条件认领与余额入账同事务；profile 不存在或余额读回失败使事务失败，不烧掉兑换码后返回虚构余额。保留 revoked、redeemedAt 条件认领。

证据：[redeem-code.ts:87–107](../packages/backend/src/server/api/endpoints/agents/redeem-code.ts#L87)。验证 B、静态事务及 affected 检查；重复兑换和故障回滚待 R1。

### #15 quick-action 部分生效才发现不可执行 — 已修复（P1，M）

先验证整组选中会话属主一致和目标用户存在；若动作包含封用户，先检查 moderator 资格再做任何会话修改。必要写入使用事务，不把通知或外部封禁清理误称为跨系统原子操作。

证据：[quick-action.ts:96–98](../packages/backend/src/server/api/endpoints/admin/agents/governance/quick-action.ts#L96)。验证 B、J 的 moderator 预检且零 session 写入；真实混合动作待 R1。

### #16 免费额度计数创建与 TTL 分离 — 已修复（P1，S）

INCR 与 EXPIRE 用 Lua 同步执行，避免两条命令之间崩溃留下永久键，并刷新历史无 TTL 计数键。

证据：[AgentModelUsageService.ts:168–169](../packages/backend/src/core/AgentModelUsageService.ts#L168)。验证 B、J；真实 Lua/跨进程待 R2，不宣称数据库与 Redis 分布式原子。

### #17 模型流水与扣费非原子、失败对象污染 — 已修复（P1，M）

pending 条件更新与扣费同数据库事务；只在提交后修改调用方 log，失败或重复结算补偿本次免费额度。拒绝非有限费用；付费重试清空旧免费快照。保留允许负余额规则。

证据：[AgentModelUsageService.ts:155、186、215](../packages/backend/src/core/AgentModelUsageService.ts#L155)、[结算失败后同对象重试测试](../packages/backend/test/unit/AgentModelUsageService.ts)。验证 B、J；崩溃窗口与并发免费资格待 R1、R2。

### #18 签到治理明细翻页反复全量聚合 — 已修复（P2，M）

四类重聚合缓存 5 分钟，保留全历史统计，不擅自截成近 90 天；明细分页、筛选仍独立执行，统一日期和稳定次序。汇总写后可能延迟 5 分钟是明确的缓存契约。

证据：[agents-checkin-reports.ts:141–145](../packages/backend/src/server/api/endpoints/admin/agents-checkin-reports.ts#L141)。验证 B；真实统计口径和执行计划待 R1。

### #19 数据库保存上游 Key — 明确保留设计（P2，S）

数据库是部署者的凭据保管边界，未证实 Key 泄露；不引入应用层加密及第二套部署密钥管理。BYOK pack 不返回原始 Key，错误仍复用脱敏 helper。管理员正常编辑/保存契约保留，不声称本次实现了“Key 加密”。

证据：[AgentUserModelService.pack:189](../packages/backend/src/core/AgentUserModelService.ts#L189)、[错误脱敏](../packages/backend/src/misc/llm-error-detail.ts)。验证为只读字段/调用链复核；未审查真实密钥值。

### #20 Docker 上下文包含本地材料 — 已修复（P1，S）

排除 .git、.zcode、AGENTS.md、data/logs、日志和历史 diff/patch，不误排构建必需源码，不读取或删除本地密钥文件。

证据：[.dockerignore](../.dockerignore)。验证 E 的排除规则复核；镜像上下文与镜像内容待 R5。

### #21 Action 浮动引用 — 已修复（P2，M）

28 个工作流的可执行 Action 统一固定真实 40 位提交 SHA，保留版本注释。静态检查 124 处 uses，无外部浮动引用；本地/容器引用按各自形式识别。

证据：[.github/workflows](../.github/workflows)。验证 E 的全部 YAML 和引用扫描；真实执行、凭据与更新机器人待 R5。

### #22 workflow 默认权限 — 已修复（P2，M）

显式 contents:read 基础权限，仅在发布、评论、包推送和 OIDC 等实际任务保留所需写权限。未机械剥掉 release/packages 权限；补齐生产构建工作流的缺项。

证据：[lint.yml:36](../.github/workflows/lint.yml#L36)、[docker.yml:30、89](../.github/workflows/docker.yml#L30)、[test-production.yml](../.github/workflows/test-production.yml)。验证 E；真实 GitHub 权限待 R5。

### 分页、业务一致性与输入（23–43）

### #23 在途分页 reset 丢失 — 已修复（P2，M）

reset 立即递增世代，旧响应不能复活列表，并排队补发当前筛选的 reset；队列/内容库切换和复审加载有对应版本检查。保留串行防抖、pageSize+1 与持久化。

证据：[use-governance-pagination.ts:21–47](../packages/frontend/src/composables/use-governance-pagination.ts#L21)、[分页回归](../packages/frontend/test/pagination.test.ts)。验证 F；快速切换与刷新交互待 R4。

### #24 TypeORM 依赖风险 — 已修复（P2，M）

0.3.28 升至 0.3.31，保持当前 0.3 线。官方问题在 migration:generate 模板生成调用面；本仓库手写迁移，不能把版本命中写成现有 API 已可利用。

证据：[backend/package.json:176](../packages/backend/package.json#L176)、[项目迁移规范](../AGENTS.md)。验证 B、E；真实 ORM 查询待 R1。

### #25 chart 凭据位置 — 已修复（P2，S）

PostgreSQL 凭据从 ConfigMap/Deployment 字面量改为 Secret，应用与数据库通过 secretKeyRef 读取；values 中明确保留示例值。Secret 不是应用层加密，也不能据此断言本 chart 已在使用。

证据：[Secret.yml:8](../chart/templates/Secret.yml#L8)、[Deployment.yml](../chart/templates/Deployment.yml)、[values.yml](../chart/values.yml)。验证 E 的模板/配置调用链；Helm 渲染与集群启动待 R5。

### #26 巨型 Vue 组件职责混杂 — 已修复（P2，L）

会话页抽取 rules、worldbook、proactive，管理设置页抽取 checkin、credits、migration。父层保留 API、共享表单、生命周期、懒加载、URL tab 和审查写入闸口；未将所有状态机械移入巨型 composable。强耦合模型、绘图和记忆面板暂保留，不声称全页面已拆成独立业务模块。重复抽样、预览与 placeholder pack 复用现有或轻量 helper。

证据：[会话子组件](../packages/frontend/src/pages/chat/agent-session.proactive.vue)、[设置子组件](../packages/frontend/src/pages/admin/agents-settings-checkin.vue)、[抽样](../packages/backend/src/core/agent-plaza-sampling.ts)、[预览](../packages/backend/src/core/agent-preview-text.ts)。验证 F；面板保存、禁写和嵌入交互待 R4。

### #27 测试覆盖不足 — 已修复（P2，M；同时纠正旧计数）

“只有 4 个后端测试”是误计，不是改动依据。本次按真实行为补结算失败重试、签到事务、会话占位、压缩源重检、未读 CAS、下载授权、分页 reset、正则超时、任务锁和宿主来源测试，不追覆盖率数字。

证据：[CodeQualityBoundaries](../packages/backend/test/unit/CodeQualityBoundaries.ts)、[AgentCheckinService 回归](../packages/backend/test/unit/AgentCheckinService.ts)、[前端 test](../packages/frontend/test)。验证 J、F；单测模拟不替代文末集成验收。

### #28 流水内存合并深分页和 count 条件漂移 — 已修复（P2，M）

用户与管理端共用 SQL UNION ALL，在数据库按 ts/kind/id 排序分页；count 使用相同用户、BYOK、日期条件，修复 redeem count 额外绑定参数，raw numeric 金额显式转 number。

证据：[agents/_billing-logs.ts:57、114–121、146](../packages/backend/src/server/api/endpoints/agents/_billing-logs.ts#L57)。验证 B、J 的占位符/参数集合、count 和 numeric 回归；真实 PostgreSQL SQL 与深页计划待 R1。

### #29 附件/头像逐项 pack — 已修复（P2，M）

消息附件、角色及会话列表按 ID 批量 pack；消息保留 withDeleted。批量头像包含真实展示的已发布快照 avatar，而不是只抓草稿 avatar。QueryBuilder 选列补实体别名，避免 hydration 漏字段。

证据：[timeline.ts:90](../packages/backend/src/server/api/endpoints/agents/messages/timeline.ts#L90)、[sessions/list-mine.ts:125](../packages/backend/src/server/api/endpoints/agents/sessions/list-mine.ts#L125)、[characters/public-list.ts](../packages/backend/src/server/api/endpoints/agents/characters/public-list.ts)。验证 B；真实查询次数与墓碑/发布头像待 R1、R4。

### #30 rollback 同毫秒边界 — 已修复（P1，S）

按 createdAt/id 稳定边界删除锚点及之后消息，最新消息也按相同二元顺序重算；短锁与 send 互斥，并使自动摘要失效。

证据：[rollback.ts:99–103](../packages/backend/src/server/api/endpoints/agents/messages/rollback.ts#L99)。验证 B、静态边界复核；同毫秒多消息实际回滚待 R1。

### #31 压缩侧车引用失效、异步旧结果复活 — 已修复（P1，M）

消息边界列没有消息 FK，不能指望消息删除自动清理。历史修改使自动摘要 stale；导入替换删除旧便签。LLM 返回后锁会话、重读源、核对条数及指纹，拒绝删/改后的结果；用户改写摘要保留，状态/文本/排序使用窄列更新。

证据：[失效 helper:9–13](../packages/backend/src/server/api/endpoints/agents/messages/_invalidate-compression.ts#L9)、[AgentCompressionMemoryService.ts:975](../packages/backend/src/core/AgentCompressionMemoryService.ts#L975)。验证 B、J 的 deleted/edited/unchanged 三分支；实际并发待 R1。

### #32 自有列表最多 100 条 — 已修复（P2，M）

后端与真实前端消费者接入游标。会话保持 lastMessageAt DESC/id DESC，而非擅自换成创建顺序；缺失或无时间游标返回空，不退回第一页重复。返回数组形状保留。

证据：[sessions/list-mine.ts:88–97](../packages/backend/src/server/api/endpoints/agents/sessions/list-mine.ts#L88)、[cursor-page.ts:14–36](../packages/frontend/src/utility/cursor-page.ts#L14)、[home.agents.vue](../packages/frontend/src/pages/chat/home.agents.vue)。验证 B、F；超过 100 条和列表同时活跃待 R1、R4。

### #33 文风订阅并发主键冲突 — 已修复（P2，S）

不再先查后插；以既有复合主键保证幂等，23505 视为已订阅，其他数据库错误继续抛出，不笼统吞错。

证据：[styles/subscribe.ts:58–67](../packages/backend/src/server/api/endpoints/agents/styles/subscribe.ts#L58)。验证 B；实际并发订阅待 R1。

### #34 迁移 Key 比较与虚构余额 — 已修复（P1，S）

SHA256 字节用 timingSafeEqual；入账命中与事务内余额读回必须成功。保留原唯一迁移请求占位与通知时序，不新增授权系统。

证据：[credits/migrate.ts:102、155–161](../packages/backend/src/server/api/endpoints/agents/credits/migrate.ts#L102)。验证 B 与比较/事务静态复核；真实幂等迁移待 R1。

### #35 名称、模型等输入边界 — 已修复（P2，S；部分旧断言不成立）

创建会话空白模型 ID 规范化为未指定、使用既有默认；更新名称 trim，纯空白不覆盖名称。更新空模型仍保留原产品语义。复核角色/文风 schema 与列长度已一致，不机械重复限长或增加任意配额。

证据：[sessions/create.ts:109](../packages/backend/src/server/api/endpoints/agents/sessions/create.ts#L109)、[sessions/update.ts:118–122](../packages/backend/src/server/api/endpoints/agents/sessions/update.ts#L118)。验证 B；真实 API 提交与表单待 R1、R4。

### #36 重复 send、模型 NaN 与保存原文 — 已由当前实现解决（P2，S）

当前 send 已用条件 UPDATE 原子占位，保存原始用户文本是历史展示契约，过滤后的文本才送模型。模型配置归一化/参数校验已有 Number.isFinite；本次结算入口也拒绝非有限费用（#17）。不把保存原文、允许负余额或既有产品策略当成独立缺陷重写。

证据：[send.ts:337、365](../packages/backend/src/server/api/endpoints/agents/messages/send.ts#L337)、[agent-llm-models.ts:276、377](../packages/backend/src/misc/agent-llm-models.ts#L276)。验证为调用链复核与 B；pending 与历史修改的新互斥见 #9，不冒充本次新建占位。

### #37 nullable enum 的“全部”筛选失败 — 已修复（P2，S）

AJV nullable 不会自动使 enum 允许 null。外审 status enum 显式包含 null，其他可空枚举按实际调用校准，不仅改前端显示。

证据：[external-audit/list.ts:34](../packages/backend/src/server/api/endpoints/admin/agents/governance/external-audit/list.ts#L34)、[外审日志端点](../packages/backend/src/server/api/endpoints/admin/agents/external-audit/logs/list.ts)。验证 B 和 schema 复核；实际“全部”API 请求待 R1。

### #38 审核列表排序不稳定 — 已修复（P2，S）

数据库角色/文风查询和合并后的 JS 排序均补 id 决胜，不能只修 SQL 一半；pending 与历史次序保持原方向。

证据：[review/list.ts:86、114、145–151](../packages/backend/src/server/api/endpoints/admin/agents/governance/review/list.ts#L86)、[list-pending.ts](../packages/backend/src/server/api/endpoints/admin/agents/review/list-pending.ts)。验证 B；同时间批次翻页待 R1。

### #39 图片封禁双表、奖励双写 — 已修复（P1，M）

共用图片封禁 helper，generation 窄列条件更新与 DriveFile 标记同事务；失败补偿已变更的 S3 ACL，补偿失败有日志。奖励入账与流水同事务，命中与余额读回失败回滚。S3 与数据库不是分布式事务，未假称消除所有外部并发。

证据：[图片 helper:51–89](../packages/backend/src/server/api/endpoints/admin/agents/images/_set-blocked-core.ts#L51)、[issue-reward.ts:94–122](../packages/backend/src/server/api/endpoints/admin/agents/credits/issue-reward.ts#L94)。验证 B、静态事务/补偿复核；实际双表故障、并发 ACL 和通知待 R1、R3。

### #40 外审复审 take(500) 与过滤后 offset — 已修复（P2，M）

规则按自己的时间窗统计；threshold 候选与未处置资格统一后再 offset/limit，删除任意全局 500 截断。保留已删除 session 的历史日志资格，COALESCE 未匹配的 session 为未封禁；页内用户批量 pack，排序有稳定用户 ID。

证据：[external-audit/review-list.ts:73、100、117](../packages/backend/src/server/api/endpoints/admin/agents/governance/external-audit/review-list.ts#L73)。验证 B 与 SQL 静态复核；超过 500 候选、孤儿日志及真实执行计划待 R1。

### #41 移动推送 deviceId 无约束 — 已修复（P2，S）

register/unregister 均限制非空且最长 512；不增加没有产品依据的设备总量限制。

证据：[mobile-push/register.ts:46](../packages/backend/src/server/api/endpoints/mobile-push/register.ts#L46)、[unregister.ts](../packages/backend/src/server/api/endpoints/mobile-push/unregister.ts)。验证 B；实际移动推送注册待 R4。

### #42 聊天发送无限额 — 已由当前实现解决（P2，S）

私信和群聊创建已有 1 小时/500 次限流及 checkChatAvailability 的写权限检查。未发现缺失限流，不添加任意新限额。

证据：[create-to-user.ts:24–26、119](../packages/backend/src/server/api/endpoints/chat/messages/create-to-user.ts#L24)、[create-to-room.ts](../packages/backend/src/server/api/endpoints/chat/messages/create-to-room.ts)。验证为只读配置/调用链复核。

### #43 emoji mutation 缺 secure 即权限缺失 — 误报/不适用（P2，S）

16 个管理表情 mutation 均有 canManageCustomEmojis policy，ApiCallService 实际执行。secure 限制令牌来源，不是用户权限开关；不机械给所有端点加 secure。

证据：[emoji/delete.ts:14](../packages/backend/src/server/api/endpoints/admin/emoji/delete.ts#L14)、[ApiCallService.ts:315、406–409](../packages/backend/src/server/api/ApiCallService.ts#L406)。验证为 16 个端点及分派调用链复核。

### 运行状态、通信与工程（44–64）

### #44 阿里移动推送绕过离线策略 — 已修复（P2，S）

删除在线分支之后的无条件移动推送调用；沿原离线/通知策略发送，保留 Web Push 订阅与元数据开关，不把两套通知配置合并成新规则。

证据：[PushNotificationService.ts:120](../packages/backend/src/core/PushNotificationService.ts#L120)。验证 B、调用链复核；实际在线/离线推送待 R2、R4。

### #45 删除消息后未读数量/锚点失真 — 已修复（P2，M）

私信、群聊与智能体消息删除后重查剩余未读，用 Lua 对 marker/first/count 快照 CAS，变更则重试；不能简单清空仍存在的未读。read-all 仅移除已读到的集合成员，未读写入/清除用 MULTI；保留老数据未知计数。

证据：[reconcile-unread.ts:9–36](../packages/backend/src/misc/reconcile-unread.ts#L9)、[ChatService.ts:449–485](../packages/backend/src/core/ChatService.ts#L449)、[AgentMessageNotifyService.ts:81](../packages/backend/src/core/AgentMessageNotifyService.ts#L81)。验证 B、J 的 CAS 变更重试和老数据分支；真实 Redis/消息竞态待 R2。

### #46 悬空异步与无记录吞错 — 已修复（P2，M）

延迟聊天通知、封禁清理、Dashscope 后台写入和推送清理补 await/有意义的 catch。延迟通知要求 marker 仍等于本次消息 ID，避免旧定时器推送已经变化的消息；管理日志 await logSafely，既不悬空，也不因日志失败误报已生效封禁失败。

证据：[ChatService.ts:233](../packages/backend/src/core/ChatService.ts#L233)、[UserSuspendService.ts:71、80、132](../packages/backend/src/core/UserSuspendService.ts#L71)、[PushNotificationService.ts:168–174](../packages/backend/src/core/PushNotificationService.ts#L168)。验证 B；真实事件时序/失败日志待 R2、R3。

### #47 非法生图 URL 错误不一致 — 已修复（P2，S）

模型端点和上游图片 URL 的安全校验错误转换为既有生图错误，不向调用方泄露任意底层异常；下载禁止重定向并保持大小上限。

证据：[AgentImageService.ts:808–823](../packages/backend/src/core/AgentImageService.ts#L808)。验证 B、静态错误转换；实际 URL 响应待 R3。

### #48 聊天数组 SQL 字符串拼接 — 已修复（P1，S）

array_append/array_remove 的 reaction 改参数绑定，不依赖远处调用者验证来证明 SQL 拼接安全。

证据：[ChatService.ts:1220、1265](../packages/backend/src/core/ChatService.ts#L1220)。验证 B、SQL 静态检查；特殊字符 reaction 实际写入待 R1。

### #49 签到崩溃、补签月度次数与非法日期 — 已修复（P1，M）

普通签到与流水/额度同事务；补签在 user_profile 行锁内检查月度次数、认领、扣费与流水。日期验证往返一致，拒绝归一化后的非法公历日期；管理员补签原有免费及不占月次数语义保留。

证据：[AgentCheckinService.ts:182、243](../packages/backend/src/core/AgentCheckinService.ts#L182)、[签到事务测试](../packages/backend/test/unit/AgentCheckinService.ts)。验证 B、J；真实补签并发和故障回滚待 R1。

### #50 base64 即“有效图片” — 已修复（P2，S）

生成 buffer 先限制 20 MiB，再以 file-type 检查真实 MIME，sharp 实际解码而非只读 metadata；不信任声明 MIME，不声称检查所有动画帧。

证据：[AgentImageService.ts:859–869](../packages/backend/src/core/AgentImageService.ts#L859)。验证 B、I：有效 PNG/错误声明 MIME 通过解码，文本与有签名的截断 PNG 被真实入库闸口拒绝；完整上传/动画待 R3。

### #51 WebSocket 最后连接关闭与新连接竞态 — 已修复（P2，S）

连接增量和关闭后的减量/删除/TTL 操作使用原子 Redis 命令组合，避免旧关闭操作删掉新连接计数。在线心跳与数据库活跃写入仍各负其责。

证据：[UserWebSocketStatusService.ts:46–49](../packages/backend/src/core/UserWebSocketStatusService.ts#L46)、[对应离线测试](../packages/backend/test/unit/UserWebSocketStatusService.ts)。验证 B、J；真实多连接与推送判断待 R2。

### #52 date_trunc 单位拼接 — 已修复（P2，S）

单位作为 SQL 参数传递，保持内部有限单位选择，不依赖外部调用者验证来保护模板字符串。

证据：[AgentModelUsageService.ts:658](../packages/backend/src/core/AgentModelUsageService.ts#L658)。验证 B、静态查询复核；真实分桶统计待 R1。

### #53 BYOK 重名与进程内批量状态 — 已修复（P2，M）

BYOK 同用户的重名检查和写入在事务 advisory lock 内串行化。贴纸批量状态迁至共享 Redis，以随机归属 token 守护启动、续期、进度和释放；旧 runner 失锁后不发起下一次模型调用，不覆盖新任务。已在途调用不被 TTL 自动撤销。

证据：[AgentUserModelService.ts:207–214](../packages/backend/src/core/AgentUserModelService.ts#L207)、[AgentStickerService.ts:381–463](../packages/backend/src/core/AgentStickerService.ts#L381)。验证 B、J 的失锁停止和旧进度不冒充新批次；真实 Lua、多 worker 与停顿恢复待 R1、R2。

### #54 iframe 消息来源 — 已修复（P1，M）

守卫校验 window.parent/source 与固定 origin；referrer 缺失时只从合法父级协议消息学习来源，拒绝 null origin。确认来源后使用具体 targetOrigin，保留多宿主与 ready 后令牌注入，不硬编码唯一域名。

证据：[agent-control-embed.ts:116–140](../packages/frontend/src/utility/agent-control-embed.ts#L116)、[嵌入契约](agent-control-embed.md)、[4 项来源测试](../packages/frontend/test/agent-control-embed.test.ts)。验证 F；真实跨站 iframe/令牌轮换待 R4。

### #55 审查死调用与“所有直连都不对” — 已由当前实现解决（P2，S）

必要属主读请求已有镜像映射与写入闸口；不可达的编辑/预览逻辑不是审查页新增能力。实例级模型、识图、生图选项直连是合法只读，不能全部禁止或机械新增 admin 镜像。本次明确映射表说明并在组件抽取中保留这些边界，不将既有镜像能力冒充新修复。

证据：[agent-session-review.ts:13–24](../packages/frontend/src/utility/agent-session-review.ts#L13)、[会话 API 包装:1136](../packages/frontend/src/pages/chat/agent-session.vue#L1136)。验证 F 和真实调用点静态复核；页面只读运行验收待 R4。

### #56 整页重复后停止分页 — 明确保留设计（P2，S）

这是既有防死循环契约，不是应删除的断言。保留停止行为；真正的 reset 丢失/旧响应污染按 #23 修复，新列表游标按 #32 接入，不靠强行翻页掩盖游标错误。

证据：[分页实现](../packages/frontend/src/composables/use-governance-pagination.ts)、[pagination.test.ts](../packages/frontend/test/pagination.test.ts)。验证 F 的重复整页与 reset 回归。

### #57 lint/typecheck 非阻断 CI — 已修复（P2，S）

去除 lint、typecheck 及 locale 类型步骤的 continue-on-error；CI 不再以绿色总览掩盖这些失败。保留必要的任务/矩阵，不关闭检查。

证据：[lint.yml:55、94](../.github/workflows/lint.yml#L55)、[locale.yml](../.github/workflows/locale.yml)、[CI 检查文档](ci-checklist.md)。验证 E、B、F；GitHub 真正执行待 R5。

### #58 ESM/TypeScript 过期注释 — 已修复（P3，S）

删除 jest config 中已不适用于当前构建路线的 TypeScript 5.0 TODO；保留实际 SWC .js→.ts 测试映射和约束说明，不为删除注释改变解析行为。

证据：[jest.config.cjs](../packages/backend/jest.config.cjs)。验证 J，当前离线 ESM 套件实际可运行。

### #59 storybook git 依赖浮动 ref — 已修复（P2，S）

既有 git 依赖固定提交 `cf583db098365b2ccc81a82f63ca9c93bc32b640`，同步 manifest 与锁文件，不新增替代包。

证据：[frontend/package.json](../packages/frontend/package.json)、[pnpm-lock.yaml](../pnpm-lock.yaml)。验证 E 的冻结安装和 ref；Storybook 页面待 R5。

### #60 分词器远程词表完整性 — 已修复（P2，S；Gemini 原已正确）

GLM/DeepSeek 固定 revision 和完整 SHA256，下载后校验再落缓存；Gemini 原有固定来源/哈希不重复改造。沿用可选词表失败后的近似计数回退，不能声称 hash 失败会使整次 Docker 构建失败。

证据：[Dockerfile:66–74](../Dockerfile#L66)。GLM revision `bd8234fe5e0c09c48637a92abb0c797cb5fa0e73`，SHA256 `5a493598071550244b2ee7f26118f3edec2150b9dfa967929a99052ac83fe716`；DeepSeek revision `e815299b0bcbac849fa540c768ef21845365c9eb`，SHA256 `621ac2e32d0dba658404412318818aaa8ce8cda492e59830109d8da6b517fb41`。验证 E 的来源/脚本静态核对；镜像下载与缓存待 R5。

### #61 fork 镜像发布仍指向上游 — 已修复（P2，S）

保留 release/workflow_dispatch 多平台发布工作流，目标改为小写的 ghcr.io/<当前 owner>/<repo>，用 GitHub actor/token 登录；保留合法 packages:write、标签与 manifest 合并。没有触发任何发布。

证据：[docker.yml:11、30、89](../.github/workflows/docker.yml#L11)。验证 E；真实 GHCR 和多架构发布待 R5。

### #62 旧日志/diff 文件 — 明确保留设计（P3，S）

历史用户材料不擅自删除；Docker 排除已消除它们进入发布上下文的风险。工作区 `review_diff.txt` 是已有历史 diff，非本次修复产物，保留。没有将未知系统临时文件当成本任务文件清理。

证据：[.dockerignore](../.dockerignore)、只读文件归属/内容检查。已知本次 regex 备份已由创建者清理；验证记录由执行工具保留，不是需移入仓库的临时交付物。

### #63 ms canary — 明确保留设计（P3，S）

npm latest 稳定版仍为 2.1.3，没有适用的稳定 3.x 替换；保留当前精确锁定的 `3.0.0-canary.202508261828`，不以“去 canary”名义降级或另加依赖。

证据：[backend/package.json:142](../packages/backend/package.json#L142)、[npm 官方 latest JSON](https://registry.npmjs.org/ms/latest)。验证 E 的 registry 和版本复核，未声称改了该依赖。

### #64 历史迁移缺 IF NOT EXISTS — 明确保留设计（P3，S）

TypeORM migration 记账、已有事务与并发索引修复契约不能被通用 IF NOT EXISTS 替代。不机械重写已执行迁移；外审 status 索引原已存在，本次不重复创建。没有结构变更，未新增迁移。

证据：[1773800000000-AgentExternalAudit.js](../packages/backend/migration/1773800000000-AgentExternalAudit.js)、[迁移验证边界](ci-checklist.md#实体和迁移)。验证为静态 SQL/实体与已有记账设计复核；完整迁移 CI 待 R5，不执行 dev 实库 check-migrations。

## 依赖公告与适用范围

以下链接正文已核对。最后一次 GitHub Advisory API 请求受匿名限额 403 阻挡，改读官方公告页面完成复核；不把请求进程 exit 0 当成公告 API 成功。

| 依赖 | 官方公告 | 本分支修复下限 | 本次版本 |
| --- | --- | --- | --- |
| sharp | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)：底层 librsvg 风险 | 0.35.5 | 0.35.5 |
| ws | [GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx)：未初始化内存披露；[GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)：内存耗尽 | 8.20.1 / 8.21.0 | 8.22.0 |
| Vite | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff)：Windows fs.deny；[GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)：launch-editor Windows UNC | 7.3.5 | 7.3.6 |
| Fastify | [GHSA-247c-9743-5963](https://github.com/fastify/fastify/security/advisories/GHSA-247c-9743-5963)：Content-Type；[GHSA-9q9j-q6p8-xq58](https://github.com/fastify/fastify/security/advisories/GHSA-9q9j-q6p8-xq58)：header schema；[GHSA-4mh8-r7rc-xpvc](https://github.com/fastify/fastify/security/advisories/GHSA-4mh8-r7rc-xpvc)：HTTP/2 trailers | 5.8.5 / 5.12.2 / 5.12.5 | 5.12.5 |
| TypeORM | [GHSA-2rp8-mm9q-fp49](https://github.com/advisories/GHSA-2rp8-mm9q-fp49)：migration:generate 模板代码注入 | 0.3.31 | 0.3.31 |

没有把公告 CVE 字段不一致的内容补写成已核实 CVE，也没有声称这是所有传递依赖的完整漏洞扫描。锁文件中本次替换的旧 sharp/ws/Vite/Fastify/TypeORM 版本已清除。sharp 的配套插件及 nested override 是升级兼容修复，不是第二次无依据大升级。

## 本地验收结果

1. `pnpm install --frozen-lockfile`：依赖分片同步后和 sharp override 后均通过，未安装新增依赖。
2. 后端 `pnpm typecheck`：源码、unit、federation 三阶段通过。最终定向 Jest **10 suites / 73 tests 通过**；`pnpm build` 编译 1198 文件、复制 8 文件，完成。准确测试范围：

   ```sh
   node jest.js --config jest.config.unit.cjs --runInBand --runTestsByPath \
     test/unit/CodeQualityBoundaries.ts \
     test/unit/AgentModelUsageService.ts \
     test/unit/AgentCheckinService.ts \
     test/unit/UserWebSocketStatusService.ts \
     test/unit/agent-regex-filter.ts \
     test/unit/AgentProactiveMessageService.ts \
     test/unit/AgentService.styleFace.ts \
     test/unit/AgentService.multiKey.ts \
     test/unit/AgentService.turns.ts \
     test/unit/AgentStickerService.ts
   ```

3. 前端 `pnpm typecheck`、`pnpm exec vitest run`：**29 files / 245 tests 通过**。最后修改 timer/source/lint 和无效样式引用后，又跑相关三文件 **14 tests 通过**及类型检查/生产构建；产物包含独立 regex Worker，无 `Undefined style detected` 警告。
4. 变更源码 lint：后端 **64 文件**、前端 **24 文件**通过；仅本次修改范围，不宣称全仓 ESLint 或所有 workspace 全绿。
5. 28 个工作流 YAML 解析通过；124 处 uses 静态检查通过，所有工作流显式基础权限。没有跑 GitHub job。
6. 真实图片闸口 I：有效 PNG、文本伪装、截断 PNG 三种结果符合预期，未触及存储工作。

验证中出现且已纠正的失败：首次集中 Jest 使用三个不存在的文件名，7 个实际套件已通过但该命令整体失败，后续按上列真实名字重跑；lint 首次定位错 workspace 的 eslint 路径，改用根目录工具后修复一处空行及六处新增规范错误；新增 ESM 测试显式导入 jest 后通过；图片探针首次误写预期错误码，按真实 `AGENT_IMAGE_UPSTREAM_FAILED` 核对后通过。失败命令的 `&&` 后续步骤不计作已执行。

全前端 Vitest 的既有应用初始化曾打印 `ECONNREFUSED localhost:3000`，测试仍全部通过；未为消除该日志启动服务。生产构建保留大 chunk 的体积提示，不把其误写成构建失败或新增拆包成果。

## 未执行的运行验收与已知边界

这些是交付边界，不是助手随后自动操作数据库、部署或发送外部请求的许可。

### R1：隔离 PostgreSQL 集成（优先验收数据与额度，P1）

- #3：Note/聊天/智能体/Gallery/Page 内容引用及真实 JSONPath，包括 Page 他人孤立文件、公开房间非成员、封禁生图。
- #8–10、#13–15、#17、#30–31、#34、#39、#49：真实行锁互斥、条件更新、兑换/签到/奖励/撤销/流水故障回滚与重复提交；LLM 在事务外等待。
- #18、#28–29、#32–33、#37–40、#48、#52–53：真实 SQL 参数、numeric、别名 hydration、分页/排序/筛选、超过 100/500 条记录、advisory lock 及执行计划。

离线 mock 验证调用协议和部分写前检查，不证明 PostgreSQL 的锁冲突或 SQL 语义。本次不连接 dev/prod，也不运行有 synchronize/dropSchema 的完整 Jest。

### R2：Redis 与多进程运行（P1/P2）

- #12、#16–17、#44–46、#51、#53：真实 MULTI/Lua、read-all 与新对话、删除与新消息/已读、同用户连接增减、跨 worker 贴纸进度、锁过期后的旧 runner。
- Redis 与 PostgreSQL 之间没有分布式事务，崩溃在补偿前仍可能留下免费计数差异；并发暂占免费资格也可能影响另一调用当时的资格，未增加新的分布式结算框架。
- 批量锁丢失阻止下一次调用，不取消已经发出的调用；进程停顿、续期失败和最终状态需真实运行验证。

### R3：上游 HTTP、图像及对象存储（P1/P2）

- #1、#4–7、#13、#39、#47、#50：禁止重定向、分块慢流/大响应超时、模型 failover、真实图片上传与删除、S3 ACL 变更/补偿、HTTP 路由兼容。
- 数据库双表同事务不等于 S3 原子性；ACL 并发未用跨请求锁统一串行，补偿失败只记日志。新 generation 条件更新冲突目前沿用现有错误类型。
- 图片探针只验入库前真实解码，未验完整上传和动画所有帧；DNS 校验与禁重定向不构成通用网络沙箱。

### R4：浏览器与移动端交互（P2）

- #11、#23、#26、#29、#32、#35、#41、#44、#54–56：面板保存/共享 form、快速筛选切换、长列表加载、墓碑与已发布头像、流式 regex、审查零写入、iframe 多宿主/缺 referrer/令牌轮换、移动推送与未读定位。
- F 包含组件和 helper 测试及生产 CSS/Worker 构建，不是真实跨站 iframe、App 或浏览器端到端证明。

### R5：部署与工程（P2/P3）

- #20–22、#25、#57、#59–61、#64：Docker/Dockle、多架构镜像和词表下载、Helm 渲染/集群启动、GHCR 发布、GitHub Actions 全矩阵及隔离迁移任务。
- 已有历史迁移由部署者/CI 管理，本次没有新增迁移；不因本地 SWC/types 通过就宣称迁移无结构差异。

## 权威契约位置

运行契约集中在 [后端维护](backend-maintenance.md)、[外审](agent-external-audit.md)、[嵌入通信](agent-control-embed.md)；验证与数据库红线集中在 [CI 检查](ci-checklist.md)。本文件仅维护这 64 项的处置、证据和验收结果，不复制完整开发规范，也不作为发布公告。
