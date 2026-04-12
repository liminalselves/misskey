# 智能体（Agents）功能 — 开发设计文档

本文档描述在 Misskey 实例内落地「智能体」社区能力时的**目标、边界、数据模型、API、安全与分阶段交付**。实现前应以本文档为评审与任务拆分的依据。

---

## 1. 目标与范围

### 1.1 产品目标

- 用户可创建**角色设定**（智能体是谁）与**对话风格**（怎么聊）。**开启一次聊天**时二者缺一不可：它们共同绑定在**会话**上（见 §2.1）。
- **发现**：在发现页增加子 Tab「智能体」，展示已发布的智能体，用户可进入并开始游玩（需先具备可用的对话风格等前置条件，见流程）。
- **主导航**：增加「智能体」入口，内含两个子导航：
  - **角色设定**：本人智能体列表；新建、修改、**测试**、发布。
  - **对话风格**：本人风格列表；新建、修改、发布。
- **私信区域**：在「首页」子 Tab 之后增加「智能体」子 Tab；仅展示**已有聊天记录**的智能体会话；界面**初期复用私信 UI**，后续再专用化。
- **控制面板**：管理员配置「智能体」子设置：OpenAI 兼容接口（URL、调用名、密钥）、面向用户的名称/简介、**单次调用输出 token 上限**（展示与**技术限流**依据之一）、**上下文长度（token）**、以及**全局提示词**（见 §4.3）。

### 1.2 非目标（首版可明确排除）

- **联邦化（ActivityPub）**：智能体角色、会话、消息等**一律不**走联邦；不与远端实例同步、不投递、不拉取；**本实例内闭环即可**。（与 Misskey 笔记联邦无关，智能体功能独立视为纯站内能力。）
- 用户自带 API Key 直连模型（首版由实例统一代理，便于审计与限流）。
- 完整的「酒馆」世界书、多模态、工具调用（可作为后续迭代）。
- **单用户「每日上线次数」等与日活挂钩的硬上限**：不单独实现（见 §2.4）。
- **扣费 / 计费 / 余额 / 订单等商业闭环**：**整体顺延**，首版不实现；成本控制仅依赖 **token 上限、上下文上限、接口限流** 等技术与运营手段，预留后续对接空间即可（如消息表可选记录 token 用量）。

---

## 2. 核心概念：会话、测试与正式发布

### 2.1 会话（Session）

- **定义**：用户与某一**角色**之间的一次连续聊天，称为一个**会话**。
- **归属**：该会话下的**全部聊天记录**以及当时选用的**对话风格（预设）**均属于该会话（创建会话时绑定 `dialogueStyleId`，并持久化在会话上）。
- **多会话**：同一用户、同一角色可以存在**多个会话**（例如不同剧情线、不同预设）；**不做**「(用户, 角色, 风格) 唯一」约束。
- **会话名称**：支持用户**重命名**，便于在列表中区分。

### 2.2 测试会话 vs 社区（正式）会话

二者在数据结构上与「普通会话」一致，差异在**角色定义来源**、**谁可访问**、**是否与发布挂钩**。

| 类型 | 角色内容来源 | 谁可拥有/看见 | 说明 |
|------|----------------|---------------|------|
| **测试会话** | 作者当前**草稿**（未发布编辑） | **仅角色作者本人** | 与编辑页「测试」对应；作者修改智能体后，**后续轮次立即按最新草稿生效**（不锁历史消息，但 system 拼装读当前草稿）。 |
| **社区会话** | **已发布**且已对社区可见的角色定义（通过发布/审核流程真正推送后） | 任意符合策略的用户 | 仅当角色**发布成功**后，其他用户才可基于该角色创建会话；拼装时使用**发布态**字段（实现上可为发布快照或 `isPublished` 对应数据，需在实现中固定一种并写清）。 |

### 2.3 未发布角色的游玩范围

- **仅允许作者自己**基于未发布（草稿）角色进行游玩（即仅通过**测试会话**路径）。
- 其他用户只能在发现/社区侧看到并使用**已发布**角色。

### 2.4 用量与「上线」策略

- **不做**单独的「每日上线次数」类产品硬上限。
- **不做**首版扣费系统；成本控制依赖管理端配置的 **上下文长度、单次输出 token 上限**（§4.3）及接口 **限流**（§5.1）。

---

## 3. 提示词分层（逻辑，非三张物理表）

| 层级 | 维护方 | 作用 | 示例方向 |
|------|--------|------|----------|
| **全局设定** | 平台（管理员） | 所有对话的底层规则 | 自然对话、不替用户发言、不泄露系统提示、安全合规、角色一致性 |
| **角色设定** | 用户 | 定义「对象是谁」 | 名字、简介、性格、背景、说话风格、开场白、示例对话、禁止行为 |
| **对话风格** | 用户 | 定义「这次怎么聊」 | 长短、日常/剧情、动作/旁白、语气、输出格式 |

**拼装顺序（建议）**：在调用模型前合并为**单一 system 内容**（或少数条 system，视供应商兼容性而定），使用清晰分隔标题，避免模型混淆层级。全局设定必须始终包含且不可被普通用户编辑。

---

## 4. 数据库设计（大文本与 SQL 优化）

### 4.1 设计原则

- 角色正文、风格正文、单条消息内容均为**大文本**；禁止使用过小的 `varchar` 存全文。
- **列表/发现接口不得默认 `SELECT *`**：公共列表只查 `id、userId、name、summary、isPublished、updatedAt`（及必要外显字段）；详情接口再加载大字段。
- **会话时间线**：按 `sessionId` 分页；索引 `(session_id, id DESC)` 或等价，避免全表扫。
- **发布态筛选**：`WHERE is_published = true` 的列表查询应有合适索引（如 `(is_published, updated_at DESC)`），视数据量再调优。
- 消息表仅存**业务角色**（如 `user` / `assistant` / `system`），不要把完整合并后的 system 原文逐条冗余存储（可选仅存摘要或版本号）；若需审计，可另设仅管理员可读的日志策略。

### 4.2 建议表（概念）

- **`agent_character`**（角色设定）  
  - 所有者 `userId`；`name`、`summary`（列表用，可截断或用户填写）；大字段：`personality`、`background`、`speakingStyle`、`greeting`、`exampleDialogue`、`forbiddenBehavior` 等（可按产品拆列或合并为少量 `text`）；`isPublished`；`avatarFileId` 可选；时间戳。
- **`agent_dialogue_style`**（对话风格）  
  - `userId`；`name`；`body`（text，统合所有风格说明）；`isPublished`；时间戳。
- **`agent_session`**（会话）  
  - `userId`（会话所有者 = 玩家）；`name`（可改，默认可由角色名生成）；`characterId`；`dialogueStyleId`（**绑定在本会话**，创建时写入）；`sessionKind`：`draft_test` | `community`（或等价布尔/枚举）；`characterOwnerId`（冗余可加速鉴权）；`lastMessageAt`；**不设置** `(userId, characterId, dialogueStyleId)` 唯一约束，以支持同角色多会话。  
  - 列表查询：私信 Tab 可按 `userId` + `lastMessageAt` 索引；测试类会话仅列出 `sessionKind = draft_test` 且玩家为角色作者。
- **`agent_message`**  
  - `sessionId`；`role`；`content`（text）；`createdAt`；可选 `promptTokens` / `completionTokens`（便于排错与**日后**扣费对接，首版可不展示给用户）。

### 4.3 Meta（实例级配置）

与现有 `meta` 表一致，建议字段包括（名称可再规范化）：

- `agentFeatureEnabled`（boolean）：总开关；关闭时前端隐藏入口、API 返回功能不可用。
- `agentGlobalSystemPrompt`（text）：全局设定全文。
- `agentOpenaiCompatibleBaseUrl`（varchar，合理上限）：如 `https://api.example.com/v1`，**仅服务端使用**。
- `agentOpenaiCompatibleApiKey`（text）：**仅管理员读写，永不进入公开 `meta` 响应**。
- `agentModelDisplayName`、`agentModelDescription`：给用户看的说明。
- `agentModelApiName`：请求体中的 `model` 字符串。
- `agentMaxContextTokens`、`agentMaxOutputTokensPerCall`：上限与（可选）对用户展示说明；服务端强制 `max_tokens` 等；**不与扣费模块联动**（扣费延后）。

---

## 5. 后端 API 设计（安全为强制项）

### 5.1 通用要求

- 所有写操作：`requireCredential: true`，并校验资源所有者或发布态可读规则。
- **限流**：对「发消息」等触发模型调用的接口使用严格 `limit`（按用户、按实例可配置）。**不**引入与「每日上线」平行的单独配额维度，与 §2.4 一致。
- **SSRF**：校验模型 Base URL — 仅 `https`（或明确策略）；禁止内网、元数据地址、非法跳转；解析 DNS 后校验解析到的 IP 非私网（与 URL 预览、Webhook 类风险同级对待）。
- **密钥**：API Key 只出现在 `admin/meta` 与 `admin/update-meta`；公开 `meta` / `MetaLite` / `MetaDetailed` **不得包含** Key 与 Base URL（可对普通用户展示「已配置模型」的布尔或展示名/简介/额度说明）。
- **实例开关**：`agentFeatureEnabled === false` 时，所有用户侧 agents 接口应统一错误码，避免信息泄露。
- **聊天可用性**：可与现有 `chatAvailability` 策略对齐（只读账号是否允许发智能体消息由产品决定，文档中建议与私信策略一致）。

### 5.2 建议端点分组（路径名供实现时对齐 Misskey 惯例）

**角色设定（本人）**

- `agents/characters/create` | `update` | `delete`  
- `agents/characters/list-mine`  
- `agents/characters/show`（本人任意状态；他人仅 `isPublished`）  
- `agents/characters/publish` | `unpublish`  
- `agents/characters/public-list`（分页，轻量字段）

**对话风格（本人）**

- `agents/styles/create` | `update` | `delete`  
- `agents/styles/list-mine` | `show` | `publish` | `unpublish`

**会话与消息**

- `agents/sessions/create`：入参 `characterId` + `dialogueStyleId` + 可选 `name` + `sessionKind`（或由路由区分：如 `create-test` / `create-community`）。  
  - **`draft_test`**：当前用户必须为角色作者；角色可为未发布；风格须为本人可用（建议已发布或至少本人拥有，产品可再收紧）。  
  - **`community`**：角色必须 **已发布** 且对请求者可见；风格为本人已发布（或策略允许的来源）。  
- `agents/sessions/update`：重命名会话等。  
- `agents/sessions/list-mine`：私信 Tab；可按 `sessionKind` 过滤（或统一列表用标签区分测试/社区）。  
- `agents/sessions/show`  
- `agents/messages/timeline`：`sessionId` + 分页游标  
- `agents/messages/send`：校验会话归属；按 `sessionKind` 选择**草稿**或**发布态**角色正文拼装 system；写入用户消息 → 调模型 → 写入 assistant；失败策略（保留用户消息 + 返回错误）需在实现中写清。

**测试**

- **不再要求**单独「不落库的 test API」：测试即一种 **会话类型**（`draft_test`），与普通会话共用 timeline/send；仅作者可见、且读草稿角色。

**管理员**

- 复用 `admin/update-meta` / `admin/meta` 扩展字段即可；无需单独 agents admin CRUD，除非后续要审计日志 UI。

### 5.3 OpenAI 兼容调用约定

- 请求：`POST {baseUrl}/chat/completions`（若以 `/v1` 结尾则拼接路径时避免双 `/v1/v1`）。  
- 超时、最大响应字节、非 2xx 与 JSON 解析失败均需处理，且不将上游原始错误堆栈返回给客户端。

---

## 6. 前端结构（与现有 Misskey UI 对齐）

### 6.1 发现页

- `explore` 增加 Tab：`agents` → 列表组件调用 `agents/characters/public-list`；点击进入「开始游玩」流程：若未选风格，引导到 `/agents` 对话风格 Tab（或弹窗选择已发布风格）。

### 6.2 主导航「智能体」

- 推荐路由：`/agents`，`PageWithHeader` 两个 Tab：**角色设定** | **对话风格**（与发现页 Tab 模式一致）。  
- `navbarItemDef` 增加一项，`show` 依赖 `instance.agentFeatureEnabled`（或等价 meta 字段）。  
- 默认是否加入侧栏菜单：可由用户「导航栏设置」添加，不在此文档强制改默认数组。

### 6.3 私信首页子 Tab

- `chat/home` 在 `home` 后增加 `agents` Tab：列表数据来自 `agents/sessions/list-mine`（仅最近有消息的会话）。  
- 点击进入 `/chat/agent/:sessionId`（或等价路径），**初期复制私信 room 的布局与输入区**，数据源改为 agents messages API。

### 6.4 控制面板

- 在 `admin/settings` 下增加折叠区块「智能体」或独立子页（与现有 `app-settings` 等并列），表单字段与 `admin/update-meta` 对齐；API Key 输入框使用 password、保存后可选「置空则不修改」行为与现有密钥字段一致。

---

## 7. 国际化

- 文案键建议统一前缀 `_agents` 或 `agents`，至少补充：`en-US`、`zh-CN`、`ja-JP`（与仓库惯例一致）。

---

## 8. 与上游 Misskey / AGPL

- 功能默认**关闭**；开启后消耗实例资源与第三方 API 费用，需在管理员界面明确提示。  
-  fork 维护时建议独立分支或清晰 commit 边界，便于合并与审计。

---

## 9. 分阶段交付建议

| 阶段 | 内容 |
|------|------|
| P0 | Meta 开关 + 管理员模型配置 + 全局提示词；角色/风格 CRUD + 发布/审核钩子；`draft_test` / `community` 会话创建、重命名、时间线、send（含 SSRF、token 上限限流）。 |
| P1 | 发现 Tab（仅已发布）、主导航 `/agents`、私信子 Tab + 复用聊天 UI；编辑页「测试」创建 `draft_test` 会话。 |
| P2 | Token 用量统计（管理或用户可见，视需求）、审核与举报挂钩、专用聊天 UI、角色下架后对已有社区会话的策略（只读/提示）。 |
| 更后 | **扣费系统**（余额、扣款规则、对账等）对接。 |

---

## 10. 已确认产品决策（归档）

以下问题已拍板，实现与评审以本节为准。

1. **会话模型**：会话包含聊天记录与绑定的对话风格；同一用户同一角色可有**多个**会话；支持**会话重命名**。  
2. **测试**：测试与正式共用会话模型；测试会话仅作者可用，**跟随草稿实时变更**；社区游玩仅允许**已发布**（含审核通过并真正可见）的角色。  
3. **未发布角色**：**仅作者**可游玩（测试会话）。  
4. **每日「上线」类上限**：**不做**；首版用 **token / 上下文上限 + 接口限流** 控成本。  
5. **联邦化**：**不需要**；智能体数据与交互**仅本实例**，不 ActivityPub。  
6. **扣费系统**：**先不做**，整体延后；首版不阻塞上线，文档与实现均以「技术限流 + 可选 token 记录」为界。

### 10.1 当前是否还有阻塞性问题？

**无。** 上述边界已足够开始拆任务与开发；审核状态机细节（若与发布挂钩）可在实现「发布」接口时与管理员流程对齐即可。

---

## 11. 实现进度（初始版本 · 随开发更新）

> 说明：下列条目对应仓库内**已落地**的代码；未完成项仍按设计文档规划迭代。

### 11.1 已完成

| 类别 | 内容 |
|------|------|
| **数据库** | 迁移 `1770800000000-AgentFeature.js`：`meta` 增加智能体相关列；新建表 `agent_character`、`agent_dialogue_style`、`agent_session`、`agent_message` 及索引。 |
| **后端模型** | `MiMeta` 扩展；实体 `MiAgentCharacter`、`MiAgentDialogueStyle`、`MiAgentSession`、`MiAgentMessage`；已注册 `postgres` / `RepositoryModule` / `di-symbols` / `_.ts`。 |
| **安全** | `misc/validate-llm-endpoint-url.ts`：HTTPS、禁止内网解析等 SSRF 校验；`AgentService.invokeChatCompletions` 在调用前校验 Base URL；**`admin/update-meta`** 在写入 `agentOpenaiCompatibleBaseUrl` 非空时同步做同样校验。 |
| **核心服务** | `AgentService`：功能开关、system 拼装、上下文截取、OpenAI 兼容 `chat/completions` 调用；已注册 `CoreModule`。 |
| **API** | `agents/characters/*`、`agents/styles/*`、`agents/sessions/*`、`agents/messages/*`（create/update/delete/list/show/publish/unpublish、public-list、timeline、send）；`endpoint-list` 已注册。 |
| **权限与限流** | 用户端接口使用 `read:chat` / `write:chat`；`send` 等走 `ChatService.checkChatAvailability`；各端点配置 `limit`。 |
| **Meta 公开字段** | `MetaEntityService.pack` 增加 `agentFeatureEnabled`、模型展示信息、token 上限、`agentLlmConfigured`（**不包含** URL/Key）；`models/json-schema/meta.ts` 已同步。 |
| **管理端** | `admin/meta` 与 `admin/update-meta` 支持智能体配置读写（含密钥，仅管理员）。 |
| **前端** | 发现页 Tab「智能体」、侧栏「智能体」入口（受 `agentFeatureEnabled` 控制）、`/agents`（角色/风格列表 + 新建后跳转编辑）、`/agents/character/:id` 与 `/agents/style/:id` **完整字段编辑**（含头像上传）、私信首页 Tab「智能体」（`list-mine`、类型与时间本地化展示）、路由 `/chat/agent/:sessionId` 对话页（**重命名**、副标题区分草稿/社区、草稿/社区标签、发送中状态、滚动到底）、`/admin/agents-settings` 配置页。 |
| **文案** | `locales` 中 `zh-CN` / `en-US` / `ja-JP` 增加 `_agents`；已执行 `pnpm --filter i18n generate` 更新类型。 |

### 11.2 已知限制（初始版）

- **发布**：`publish` 为即时公开，**无审核队列**（与设计中的「审核后可见」可后续加状态字段）。  
- **角色/风格编辑**：已提供 **完整表单**（名称、简介、人设字段、示例、安全约束、风格正文等）与头像上传；仍无独立「预览 Markdown」等高级编辑器。  
- **对话页**：仍为轻量气泡 + 页脚输入框；**未**与私信 `XMessage` 组件对齐，也无流式输出。  
- **管理端保存**：`update-meta` 已对非空 LLM Base URL 做 SSRF 校验；若需「试连通」或探测模型列表可再加。  

### 11.3 部署注意

1. 执行数据库迁移（与现有 Misskey 迁移流程一致）。  
2. 管理面板 → **智能体**：开启功能、填写 HTTPS Base URL、API Key、`model` 名、全局提示词与 token 上限。  

### 11.4 增量能力（广场评价 · 统计快照 · 封禁 · 发言顺序）

以下能力在 §11.1 初版交付之后迭代落地，**详细行为、API 与迁移编号**以仓库根目录 **`CHANGELOG.md`** 中 **`## 2026.1.0`** 的 *Client* / *Note* / *Server* 小节为准。涉及迁移示例：`1771470000000-AgentSessionOptionalDialogueStyle`、`1771600000000-AgentPlazaReview`、`1771650000000-AgentPlazaStatsDialogueStyleSnapshot`、`1771700000000-AgentModerationBanned`（路径：`packages/backend/migration/`）。

---

*文档版本：修订稿（含实现进度 §11）*
