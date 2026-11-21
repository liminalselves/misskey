# Misskey fork 项目规范

只记项目特有惯例，全局规范见用户级 AGENTS.md。

## 提交授权与提交规范（2026-11-21 起）

- 助手可在 develop 及 feat/fix/hotfix/sync 分支上直接 commit，无需每次请示；master 仍禁止任何直推 commit/push。
- 未经用户明确要求不 push、不开 PR、不合并、不打 tag；push/PR/合并/tag 均属交付或发布动作，须用户发起。发布前准备阶段按「发布流程」允许的范围内操作。
- 提交信息用中文 Conventional Commit（见 commit-rules skill）。
- AGENTS.md 随仓库提交维护（2026-11-21 起不再 gitignore）。

## 文档放置

- 根目录只留 README、CHANGELOG、LICENSE/COPYING、CONTRIBUTING、SECURITY、CODE_OF_CONDUCT、CLAUDE.md；其余文档放 `docs/`，并登记在 `docs/README.md`。
- 过程记录、一次性审查报告、设计草稿不入库；有长期价值的结论并入对应契约文档。新增文档前先查是否能并入现有文档。

## 分支模型（git flow，2026-10-22 起）

origin=liminalselves/misskey，upstream=misskey-dev/misskey，默认分支 master。

- `master`：生产分支，部署来源。origin 保护「仅 PR 合入 + 禁 force push/删除」，enforce_admins 开启（仓库主直推同样被拒）。只接受 develop / hotfix 的 PR，PR 合并用 merge commit（--no-ff 语义），不用 squash/rebase。
- `develop`：集成分支。接受 feat/fix 分支 PR；保护只禁 force push/删除，直推可用但不建议。任何新工作先 `git switch develop && git pull` 再切分支。
- `feat/<slug>`、`fix/<slug>`：从 develop 切出，合回 develop 后删除。
- `hotfix/<slug>`：生产紧急修复，从 master 切出，合 master 后必须 back-merge 回 develop（否则下次发布覆盖该修复）。
- `sync/upstream-<version>`：上游同步，从 develop 切出 merge `upstream/master`，独立 PR；不设长驻同步分支，现开现合；本地 `upstream-master` 等书签分支不推 origin。
- 合并一律 --no-ff 保留分支痕迹，便于单独 revert 某个 fix。

## 版本号（<上游基线>-liminalselves.<N>）

- 主版本 = 当前实际合并进 develop 的最新上游**正式 release** 号。当前基线 **2026.10.0**（正式 Release 提交 `de89118a22`，同步合入提交 `343107b2bb`）。核对命令：`git log -1 --no-merges --format='%h %s' develop --grep='^Release:'`。两处 package.json 当前为 `2026.10.0-liminalselves.4`。
- N = 该基线上第 N 次生产发布，每次发布 +1；同步新的上游正式 release 后基线换代、N 重置为 1。例：`2025.12.2-liminalselves.3` = 基于上游 2025.12.2 的第 3 次生产发布。
- 版本号存在于两处，必须一起改（CI `check-misskey-js-version` 强制一致）：根 `package.json`、`packages/misskey-js/package.json`。
- 不用 semver 语义理解该号，它不表达兼容性；与上游的亲缘只记 CHANGELOG（「合并上游至 X.Y.Z」），不进版本号。
- 未经人类明确指示禁止 bump 版本号；bump 只发生在发布流程中。

## CHANGELOG

- 助手只在「发布前准备」阶段编辑 CHANGELOG：把 `## unreleased` 改名为新版本号、顶部新开空 `unreleased`、按用户认可的条目整理（2026-11-21 用户明确）；其他时候一律不碰（含 `unreleased` 段日常积累）。
- 顶部始终保留 `## unreleased` 段（小写，与上游一致）；不手改已发布段落。
- 同步上游后的首次发布，版本段内加一行「合并上游至 X.Y.Z」。

## 发布流程（两阶段，均由人类明确发起）

发布 tag 为 `release-v<version>`；去掉 `release-v` 后，必须与两处 package.json、CHANGELOG 标题及镜像 tag 一致。操作顺序、命令、ACR 内置规则与 GitHub 构建边界统一见 `docs/releasing.md`。禁止以 master 分支触发覆盖 latest 替代 tag 发布；首次 ACR 完整版本构建仍须验收。

### 阶段一：发布前准备（用户明确要求时执行，到自查完毕即停）

1. 版本号：两处 package.json 按 `<基线>-liminalselves.<N+1>` 更新，须一起改。
2. CHANGELOG：按上节规则整理本次版本段。
3. 校对文档：核对 AGENTS.md、docs/（releasing.md、ci-checklist.md 等）与实际流程一致，修正过时内容。
4. 清理仓库：删除开发遗留的无用/临时文件（过程文档、死代码、遗留配置），不动用户文件。
5. commit 并推送，创建 PR（develop → master）；等 CI 全部通过，有失败先修复。仓库无 CI 时跳过。
6. CI 通过、PR 开放状态时自查 diff（版本号两处一致、CHANGELOG 段名、tag 预期指向 master merge commit），确认可发布后停下向用户汇报——**本阶段到此为止，不合并、不打 tag**。

### 阶段二：发布（用户明确命令时执行）

1. 合并阶段一创建的 PR（合入 master）。
2. 打附注 tag `release-v<version>` 指向 master 的 merge commit 并单独推送该 tag（禁 `--tags`）。GitHub Release 显示最新版本 = 用该 tag 触发的构建产物创建/更新 GitHub Release（tag 去前缀即版本号，与镜像 tag 一致，不另做 latest 覆盖）；注意建 Release 可能误触发 npm 工作流，须取消。
3. back-merge：把 master 合回 develop 并推送，develop 不得落后于已发布的 master 提交。

### Hotfix

Hotfix 从 master 切出，修复和版本更新经 PR 合 master；发布后必须 back-merge 回 develop。

## 上游同步

- `git fetch upstream` → 从 develop 切 `sync/upstream-<version>` → `git merge upstream/master`。同步 PR 不得混入任何功能改动，冲突解决单独 review。
- 自有 migration 与上游时间戳交错，禁止自动重排或修改历史迁移。同步后按 `docs/ci-checklist.md` 验证；完整后端测试仍受隔离数据库授权限制。
- 2026.10.0 同步的取舍、实际验证和部署差异统一见 `docs/upstream-sync-2026.10.0.md`。
- 同步合入后基线换代：下次发布版本号为 `<新基线>-liminalselves.1`，CHANGELOG 该版本段加「合并上游至 X.Y.Z」。

## 硬性禁止（违反即中止并报告人类）

- 直接 commit/push 到 master；对 develop 或 master force push。
- 发布流程之外 bump 版本号、打 tag、推 tag、删 tag；删除或移动已推送的 tag；`git push --tags`（逐个推发布 tag）。
- 轻量 tag 做发布 tag（必须 `-a` 附注）；发布 tag 打在 develop 上（只能指向 master 的 merge commit）。
- 只改一处 package.json。
- 同步 PR 夹带功能改动；修改历史 migration 文件。
- 把书签分支（`upstream-master` 等）推到 origin。
- gh 命令省略 `-R liminalselves/misskey`（本仓库自动解析到 upstream misskey-dev/misskey）。

## 必须停下问人类的情况

- 需要发布（bump / tag / 合 master）。
- 冲突涉及 migration、`packages/backend/src/models`、配置 schema。
- 上游基线不确定（先用上面核对命令查，仍不确定再问）。
- 需要改写已推送的历史（rebase / force push / 删 tag）。
- 本文与实际仓库状态不一致。

## 常用命令速查

```bash
# 开新分支
git switch develop && git pull && git switch -c fix/<slug>

# 合回 develop
git switch develop && git merge --no-ff fix/<slug> && git push origin develop

# 发布（人类确认后，命令与验收见 docs/releasing.md）
# Git tag 使用 release-v<version>，镜像 tag 使用 <version>。

# 上游同步
git fetch upstream
git switch develop && git pull && git switch -c sync/upstream-<version>
git merge upstream/master
```

## 后端新增实体 / API 的流程

- 新实体 `models/Xxx.ts`：仿 `AgentModelReport.ts`；注册共 4 处——`models/_.ts`（import/实体数组/Repository 类型）、`di-symbols.ts`、`postgres.ts`、`models/RepositoryModule.ts`（工厂 + providers + exports 三处）。
- migration 手写 SQL（无 generate 脚本），命名 `<13位时间戳>-<PascalCase>.js`，时间戳须大于现有最大；模板见 `migration/1783800000000-AgentModelReports.js`。SQL/实体一致性（含 jsonb DEFAULT、列注释）与按改动类型选择的 CI 验收见 `docs/ci-checklist.md`；存量初始值用 UPDATE 回填或代码层种入（见 `1784000000000` 与 MetaService）。
- `migrate/revert/check-migrations` 均操作 **dev 实库**；助手不得执行，迁移默认仅静态审查。需要实体对比时，由用户先 migrate 再 check-migrations。
- 新端点：`endpoints/` 下建文件 + `endpoint-list.ts` 加一行，EndpointsModule 自动注册。
- 时序 id 用 `IdService.gen()`（makePaginationQuery 依赖 aid 时序）；`insertOne` 不自动填 createdAt/updatedAt，须显式给。
- QueryBuilder 分页禁止 `.take()` 与 `.offset()` 混用：TypeORM `createLimitOffsetExpression` 仅在未设显式 limit/offset 时才把 skip/take 写进 SQL，`.offset()`（含 0）会让 `.take()` 被静默丢弃（翻页退化为全量）。用 `.take()/.skip()` 或 `.limit()/.offset()` 其中一对；深分页流水优先原生 SQL LIMIT/OFFSET（先例 `_billing-logs.ts`）。
- 会话写入/资源删除、压缩便签、未读重算、额度签到、正则执行、批量贴纸锁及定时维护契约见 `docs/backend-maintenance.md`。
- 模型配置与复审：外审协议、Provider 落点、待复审保留及处理范围见 `docs/agent-external-audit.md`；用户侧更新公告与已读契约见 `docs/agent-model-announcements.md`。
- admin 治理列表端点模板：`endpoints/admin/agents/governance/external-audit/list.ts`（requireModerator + makePaginationQuery + packMany UserLite）。可空 enum 参数若前端会传 `null`，`enum` 必须显式包含 `null`（`nullable: true` 不会让 AJV 的 enum 自动允许 null）；更稳妥的是前端不发送空筛选字段。

## misskey-js 类型

- 前端调用新端点一律强转（页面内 `misskeyApi as unknown as <T>(ep, data)` 或 `'ep' as Parameters<typeof misskeyApi>[0]`），不跑 `build-misskey-js-with-types` 再生成：全量构建成本高，且会浮出 api.json 过期的 schema 漂移旧账。
- 新增通知类型不属于端点类型再生成：须同步 `backend/src/models/Notification.ts`、`backend/src/types.ts` 的 `notificationTypes`、`NotificationEntityService` pack、`misskey-js/src/consts.ts`、前端 `MkNotification.vue`、三语言 `_notification` 与 `_types`，再跑 i18n generate/build。

## 智能体治理页（pages/admin/agents-review.vue）

- 单文件 tab 页，加 tab 共 7 处：`ViewKey`、`viewKeys`、`headerTabs`、模板分支、`watch(activeView)` 懒加载、`refreshCurrentView`、`onMounted` 首次加载。`view` 由路由 prop 下发，切 tab 用注入 router.replaceByPath，同步地址与路由；禁止直接写 history 或读全局 location 作为页面状态。
- 列表分页用 `composables/use-governance-pagination.ts`（untilId 游标）；fetcher 必须发 `limit = pageSize + 1`（hasMore 靠「返回条数 > pageSize」判定，恰好发 pageSize 条时翻页按钮永不出现）。
- 筛选 UI 统一用共享组件 `components/MkFilterBand.vue`（折叠条 + activeCount 计数徽标 + 重置按钮，有生效筛选时默认展开）+ FormSplit；页内 watcher 驱动自动应用（350ms 防抖 + 串行排队，无手动检索按钮），重置函数只恢复默认值不直接加载；筛选全量持久化 localStorage，`restoreFilters()` 须在 watcher 注册前的 setup 阶段调用（activeCount 决定 band 默认展开）。消息检索是特例：未检索不拉取，重置仅清空不触发请求（skipMessageAutoApply 抑制 + applier.cancel）。
- queue/library 只保留全宽列表，点选行打开独立审查页 `/admin/agent-library/:kind/:id`（`pages/admin/agent-library-review.vue`，桌面新标签页、手机/App 站内跳转，同会话审查分流惯例）；列表页不做主从双栏、不内联详情。列表卡片布局对齐会话治理（名称居左、徽标居右、元信息带图标）；审核状态 chip 语义配色（待审 infoWarn/已发布 accent/已拒绝 error/草稿灰）用模板内静态点访问三元分支（见前端惯例 $style 禁令），审查页与列表页各有一份。
- 行内 acct+复制用共享组件 `components/MkUserAcctInline.vue`（组件内自闭合复制与 toast，勿再挂 @copy）。
- AI 生图 tab：`images/list` 端点用 `DriveFileEntityService.packManyByIdsMap(fileIds, { withDeleted: true })` 批量打包文件并解析 `imageModelName`（Meta.agentImageModels id→name）；前端列表一律走 `MkDriveFileThumbnail` 缩略图（禁直接用生成行 url 原图，省 OSS 流量），点击缩略图通过 `os.popupAsyncWithDialog(MkLightbox)` 才加载全图；封禁/已清理/无文件一律图标占位不可预览。
- 审查页表情包网格：标题与网格分离（标题不放 grid 容器内，避免占首个格子）；贴图统一 `width:100%; height:120px; object-fit:contain` 盒，`minmax(150px, 1fr)` 保证移动端至少 2 列。
- 治理写操作后就地更新行（`patchSessionBanned` 等），不整表 reset；审查页（常在新标签页）处理后经 `utility/agent-governance-events.ts`（BroadcastChannel）通知列表页移除/更新条目，并提供「审查下一条」。概览卡片用 `openFiltered(view, 套筛选)` 跳转。

## 智能体管理页（pages/admin/agents-settings.vue）

- 导航与保存契约在 `agents-settings-sections.ts`：顶部 tab=分组、组内 MkTabs=子页，`?view` 只记子页 key（旧 key 仍有效）。表单字段按前缀归属保存分区，未登记前缀会抛错（单测 `test/agents-settings-sections.test.ts` 兜底）；新增字段须登记前缀，跨子页字段补 `leafOfField`。
- 保存只校验、只提交有改动的分区（`buildSectionPayload`）；校验失败抛 `SettingsValidationError(section, msg, anchor)`，页面据 `data-settings-anchor` 切子页、展开卡片并高亮。数字字段一律 `intField/numField` 严格校验，不静默回退默认值。
- `agentCheckinSettings` 整体写入：保存时须合并原值（`checkinSettingsExtras`），本页不编辑的 `roleMultipliers` 等不得被清空。
- 后端 `update-meta` 的 URL 校验用 `createLlmUrlBatchValidator`：与已存配置相同的 URL 只做语法校验、新主机按主机名去重并行 DNS（5s 超时）；运行时调用前仍走 `assertSafeLlmHttpsUrl`。`updateServerSettings` 审计日志只记变化字段。

## 模型报表与用户用量报表

- 三处报表各自独立成组件、单独维护，都在 `components/agent-report/` 下：全站模型报表 `site/SiteModelReport.vue`（控制面板→智能体管理→报表→模型，端点 `admin/agents/reports/*`）、用户管理页「模型用量」tab `admin-user/AdminUserUsageReport.vue`（端点 `admin/users/agent-usage-report`）、用户侧「我的用量」`mine/MyUsageReport.vue`（端点 `agents/usage/report`），后两者后端共享 `endpoints/agents/usage/_user-usage-report.ts`。三处的端点、存储键、布局、CSV 各管各的，禁止再抽「万能」父组件；只共享目录根部的无业务件（ReportFilterBar/ReportPanel/KpiCards/TrendPanel/TrendChart/ModelTable/BreakdownPanels 等）与 `user-report-shared.ts`（两个用户报表的响应类型、指标表、CSV 列）。改共享件须同时顾及三处。
- 简洁/详细模式：每份报表顶部 `ReportModeSwitch` + `use-report-mode.ts`，默认简洁（localStorage `<存储键>:mode`，三处各自一份）。简洁模式 = 时间+模型筛选、核心 KPI（全站 请求/成功率/扣费/用户，用户侧去掉用户）、一张趋势图（不分组不对比）、`SimpleModelList` 模型排行；详细模式 = 原完整报表。简洁模式下粒度/用途/对比/分组一律忽略（`useReportFilters({ simple })` 统一处理，存储值保留以便切回详细），请求参数不得带这些隐藏筛选。消费日志/请求记录两种模式都保留。
- 全站报表端点 `admin/agents/reports/{summary,trend,models,breakdowns,users}` 共用 `_report-params.ts` 参数；所有聚合只经 `core/AgentModelReportService.ts` 的同一 WHERE 与 METRICS_SQL，新增指标/维度在此扩展，不在端点里另写 SQL。
- 口径：排除 `nonModelUsageKinds`；成功率分母 = total − pending；耗时 avg/P50/P95 只算成功调用；时间边界与分桶一律北京时间并服务层补零（前端 `report-utils.ts` 与后端 `resolveReportBucketUnit` 粒度规则须同步）。模型伪键 `__byok__`/`__unassigned__`；models 明细不受模型筛选（便于对照），其余区块受全部筛选。
- 用户报表 = 同一服务加 `ReportFilter.userId`（走 userId+requestedAt 索引），口径与全站完全一致；与全站的差异只有：BYOK 按单个模型拆行（`byModel({ splitByok })`）、不显示活跃用户、多了余额卡与角色/文风表（`byDimension`，分页独立缓存）。消费日志（`*/billing-logs`）与请求记录（`agents/usage/logs`、`admin/users/agent-usage-logs`，共用 `_usage-logs.ts`）是完整流水，不受筛选影响。
- 性能契约（2026-11-11 用 300 万行实测）：分桶一律 `date_bin` 加周一 0 点 +08 origin（与按北京时间 date_trunc 等价，快约 3 倍）；不分组聚合须 `GROUP BY GROUPING SETS (())` 或带分组键（裸聚合配 COUNT(DISTINCT) 会走 userId 索引，慢约 10 倍）；去重用户数和分位数按需计算（`metricsSql` 的 users/percentiles 开关）；所有语句经服务内并发闸门（每进程 2 条）；端点结果走 `cached()`（Redis 60s，已结束窗口 600s，相同请求合并），前端把时间窗取整到分钟以命中缓存；构成区和用户排行进入视口才加载。
- 筛选栏吸顶可折叠为一行摘要（折叠状态单独持久化，手机首访默认折叠）；手机端长选项行横向滚动不换行、触屏输入框 16px 防 iOS 聚焦放大。图表组件 `LineChart`/`DoughnutChart` 为本目录通用件，配色统一取 `chart-theme.ts`。

## 会话审查（独立只读页，复用用户侧聊天 UI）

- 路由 `/admin/agent-session/:sessionId` → 包装页 `pages/admin/agent-session-review.vue` 传 `review` prop 复用 `pages/chat/agent-session.vue`；入口在治理页会话列表/消息检索/各卡片 jumpSession（电脑新标签页，手机/App 站内跳转）。
- 后端镜像端点在 `endpoints/admin/agents/governance/session-review/`（与用户侧读端点同参数同返回形状，跳过属主/封禁断言，session 镜像剔除 pending 自愈写库并附属主 UserLite）；前端映射表 `utility/agent-session-review.ts`，会话页与子组件的读请求都须按该表分流。新增读能力时：补镜像端点 + 映射；图片占位状态走 `image-placeholder-status`，与用户侧共用 `agents/images/_pack-placeholder.ts`，读取失败不得当成未生成。
- 只读闸口：`moderationLocksSessionWrites` 在 review 模式强制 true；未走该闸口的写函数须单独加 review 守卫，后端属主校验兜底。图片卡片隐藏手动/重新生成按钮，自动生图与设置 watcher 只查询已有记录；`sessions/read`（清未读）绝不能在 review 模式调用。
- review 模式其他差异：不订阅 newAgentMessage 流事件改为 30s 轮询新消息、封禁会话仍可查看（横幅展示原因）、余额/免费额度 chip 不拉取、消息头像传 `messageUser`（属主）而非 `$i`。

## 私信/智能体未读计数与定位

- Redis 未读三元组随标记同生同灭：`newXxxExists`（标记=最新未读 id）、`firstUnreadXxx`（发消息时 SET NX，首条未读 id）、`unreadXxxCount`（INCR 条数）。已读/退群/踢人/删房间/read-all 必须三键同清（收口在 `ChatService`、`AgentMessageNotifyService`）；只有标记的存量老数据 count/firstUnreadId 为 null，前端退化为圆点、不出定位按钮，已读一次后自愈。
- 列表条数：`chat/history` 注入 `unreadCount`（schema 在 `chat-message.ts`，misskey-js 手改 src+built），`agents/sessions/list-mine` 用 `unreadCountMap`（一次 SMEMBERS+pipeline）。
- 对话页未读快照端点：`chat/unread-info`、`agents/sessions/unread-info`（属主校验同 sessions/read）。**前端必须先抓快照再发 read**，否则计数被清零（room.vue/agent-session.vue 的 captureXxxSnapshot 先于 send('read')/markRead）。审查/嵌入模式不抓快照，故这两个端点不需要 session-review 镜像。
- 「查看 X 条未读消息」按钮与「以下为新消息」分割线以 firstUnreadId 为锚；首条未读在当前视口完整可见时不出按钮，用户手动滚到首条未读可见即收起。

## 网盘文件删除墓碑（已清理占位）

- 文件行删除统一收口在 `DriveService.deletePostProcess`：删 `drive_file` 行前写 `drive_file_tombstone`（id 沿用被删文件 aid，存归属者/name/type/size/properties 宽高/deletedAt；远程过期转直链不删行不写墓碑）。新增任何直接删 `drive_file` 行的路径必须先写墓碑，禁止绕过该收口。
- 展示面打包：`DriveFileEntityService.pack/packNullable/packManyByIdsMap` 的 `withDeleted: true` 选项命中墓碑时返回占位对象——`isDeleted: true`、`deletedAt`、`url/thumbnailUrl` 为 null、始终带归属者 UserLite（用户已注销则 user 为 null）。无墓碑的历史旧数据维持原行为（null/过滤）。
- 内容展示面必须开 `withDeleted`（已接入：Note 附件、Chat 消息、Gallery、Page 正文/头图、智能体消息附件/角色表情包/生图 placeholder-status 与 generate-placeholder、session-review 镜像）；头像、草稿、治理后台、AP 出站等非内容面不开。
- 前端统一占位组件 `components/MkDeletedFileMedia.vue`（默认整格，compact 为行内 chip；文案硬编码中文）；`MkMediaList` 内置 isDeleted 分支并自动排除灯箱/下载，新展示面优先复用 MkMediaList 或该组件。
- misskey-js 类型手改两处（不再生成）：`src/autogen/types.ts` 与 `built/autogen/types.d.ts` 的 DriveFile 加 `isDeleted?/deletedAt?`。

## 前端惯例

- Service Worker 离线页（断网兜底页）：模板在 `packages/sw/src/scripts/offline-page.ts`，`sw.ts` 的 `offlineContentHTML` 只取 locale 后调用；新增/改文案在 `_offlineScreen` 下加 key 并 `pnpm --filter i18n generate && build`。品牌图按「控制面板→品牌」实例图标动态生效：客户端 `initialize-sw.ts` 把 `instance.iconUrl` 随 initialize 消息交给 SW，`syncOfflineLogo` 抓取缓存到 CacheStorage（同步版本缓存名，SW 换代自动失效），离线页 `<img>` 指向虚拟路径 `/__liminal-offline-logo__`（fetch 拦截器走 `offlineLogoResponse`），未配置/未缓存回退打包兜底图 `assets/liminal-brand.webp`（esbuild `dataurl` loader 内联）。locale 闸口禁止动 `locales/zh-CN.yml`：语言包构建会用日文补齐其他语言缺失的 key，`?? ZH_CN` 永不触发，故 zh 环境的三条指引一律优先 `ZH_CN` 常量；语言包整体取不到时（断网且无缓存）title/header/reload 也回退 `ZH_CN`。`swLang._fetch` 在 `_DEV_` 下强制联网刷新，失败时须回退已缓存语言包，不得抛错。
- 加载态契约：展示用 `loading` 初始 false（或首屏另设标志），禁止「初始 true + 函数开头 `if (loading.value) return`」——首次加载永不发请求（agents/index、home.agents 曾中招）。加载函数一律 try/finally 复位；失败保留已有数据，从未成功时出 `MkResult type="error"` + 重试；会被筛选/切换反复触发的加载用请求序号丢弃迟到响应（先例 Paginator `initSeq`、job-queue、announcements）。`misskeyApi` 带超时（默认 60s，`agents/`、`admin/` 300s，超时 code `REQUEST_TIMEOUT`），新的长耗时非 agents/admin 端点须调整 `requestTimeoutMs`。
- Vue 模板禁止 `$style[动态键]`：生产构建的 UnwindCssModuleClassName 插件（`packages/frontend/lib/`）把静态 `$style.xxx` 内联为字面量并移除运行时 `__cssModules`，计算式访问运行时 undefined 直接 TypeError（dev 不跑该插件故不复现，仅生产崩）。动态样式一律写静态点访问三元分支（先例 `components/agent-report/KpiCards.vue` 涨跌色、`agents-review.vue` 审核徽标）；构建日志 "Undefined style detected" = 模板引用了样式块未定义的类。
- 多列数据表一律无省略号、超宽横向滚动：表容器自身 `display:grid; overflow-x:auto`，列轨 `minmax(max-content, Nfr)`；行（含表头）`display:contents` 让单元格直挂表级 grid，表头样式与行 hover/选中/弱化态全部用 `> *` 选择器承载；不设 column-gap（列间距靠单元格 padding，避免 hover 背景出缝隙），首尾单元格 padding-left/right 14px。禁止 subgrid（Safari<16）与每行独立 grid（跨行列不对齐），禁止窄屏压缩 fr 列截断或改两行/砍列的自造布局。先例：`components/agent-report/ModelTable.vue`、`components/agent-report/UsageLogTables.vue`。治理/用量类数据表的翻页用页码分页条（每页条数按钮 10/20/50 + 左右箭头 + `x / y`，共享组件 `components/agent-report/MkPagerBar.vue`），端点配 page/pageSize 并返回 items/total/page/pageSize；先例 `components/agent-report/UsageLogTables.vue` 的消费日志与请求记录。MkPagination（untilId 游标无限滚动）只用于时间线类列表，不用于这类带总数的表格。
- 移动导航、缓存与滚动分页契约、App 只读排查依据及验收见 `docs/mobile-navigation.md`；新增可缓存列表须显式 route.cache，表单/实时监控不得直接套缓存。
- 智能体相关页面文案硬编码中文（models.vue 分区标题、agents-review.vue 全页、byok 弹窗均有先例）；只有存量 i18n 键的界面沿用 `_agents` section，不为新 UI 强行加 key（加 key须 `pnpm --filter i18n generate && build`）。
- 托管控制台握手与 source/origin 约束见 `docs/agent-control-embed.md`；面板抽取保留父层 API、生命周期、共享表单和审查写入闸口，不将它们一起搬入新巨型 composable。
- 表单弹窗组件模式见 `pages/agents/byok-model-dialog.vue`（MkModalWindow + MkSelect items + footer 提交）；`MkTextarea` 无 max prop，长度校验在提交时做。
- Chart.js 全局可见性补绘在 `utility/init-chart.ts`；图表放进可分页的 `MkFolder` 时仍须监听 `@opened`，在 `nextTick` 后初始化/更新，并在旧 canvas 脱离 DOM 时销毁重建。
- 网盘手势（MkDrive.vue marquee 区）：移动端长按 400ms 激活——文件上=抓起拖拽移动（任意模式可用，浏览模式结束清临时选中；不做方向判定，立即滑动任何方向一律=页面滚动），非文件位置=框选（编辑/多选限定；锚点按文档坐标记录，跨页自动滚动不丢命中；原地松手≈点选）。浏览模式长按文件=移动而非菜单，文件操作走预览页（drive.file.info.vue 有重命名/删除等完整操作）。PC：空白左键拖=框选，文件上拖=原生移动。关闭编辑模式时（select==null）清空选中。防浏览器抢手势两板斧：触屏按住期间（marquee 非空即拦截，不等激活）capture 阶段 prevent contextmenu（浏览器决定弹长按菜单时会 pointercancel 杀手势）；file/folder 根元素 `:draggable="!isCoarsePointer"`（触屏禁用原生 HTML5 DnD，iOS Safari 长按 draggable 会触发系统拖拽抢手势）。落点命中判定一律用触点坐标（用户以手指对准目标；浮标上移 33px 仅作视觉反馈），松手时用 pointerup 坐标当场重算（静止悬停无 move 事件）；面包屑/文件夹统一用本组件内 getBoundingClientRect 包含判定（elementFromPoint 会被吸顶层和文字间隙漏掉）；悬停到有效投放目标时暂停边缘自动滚动（否则面包屑位于顶部滚动触发区互相拉扯）；cd/goRoot 切换文件夹时（select==null）清空选中，防止幽灵文件混入批量移动。
