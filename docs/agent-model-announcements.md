# 智能体模型更新与公告

## 使用

- 管理员保存对话或绘图模型配置后，系统自动记录用户可见的实际变更；无变化、仅排序或仅改连接凭据不生成公告。
- 用户进入智能体对话页时，将未读更新与手动公告合并到一个弹窗。缓存页重新进入、浏览器页面恢复可见时也会检查；已有模型刷新广播不主动弹窗。
- 点击「我知道了」后按账号记录已读；直接关闭窗口不标记已读，下次进入仍会提示。弹窗打开期间发布的新公告留到下一次检查。
- 管理员在「智能体设置」的「对话模型」或「绘图」tab 展开「发布模型公告」，填写分类、标题、正文后独立发布，不会保存尚未提交的模型配置。
- 公告分类仅用于展示，不限制接收用户。审查页和嵌入式控制面板不检查公告、不写已读记录。查询失败不会阻断聊天。

## 数据与实现

- `agent_model_announcement` 保存公告和结构化变更快照，不关联当前模型行；模型后续改名、下架或删除不会改变历史内容。新建表为空，不回填上线前的模型变更。
- 自动记录由 `admin/update-meta` 传入 `MetaService.update` 的事务回调生成，与模型配置一起提交或回滚。保存时锁定 Meta 行，变更比较使用事务内的前后快照。
- `misc/agent-model-changes.ts` 是变更字段的权威来源：对话模型复用公开打包函数；绘图模型复用 `misc/agent-image-models.ts`，只比较提供商实际支持的能力和参数。API Key、连接地址、接口模型名不写入公告。
- 已读游标复用 Registry：scope 为 `['client', 'agentModelAnnouncements']`，key 为 `lastReadId`。未读查询按公告 ID 升序返回；确认接口只推进到本次展示的最后一条 ID。
- 用户端点：`agents/model-announcements/unread`、`agents/model-announcements/read`。管理员发布端点：`admin/agents/model-announcements/create`，要求管理员权限。
- 前端共享入口为 `utility/agent-model-announcements.ts`，弹窗为 `MkAgentModelAnnouncementDialog.vue`，发布表单为 `MkAgentModelAnnouncementPublisher.vue`。同账号的重叠检查或已打开弹窗不重复请求、重复弹窗。

## 部署与检查

前后端一起更新，启动新版后端前由部署者执行迁移 `1784500000000-AgentModelAnnouncements.js`。助手不执行开发库或生产库迁移；未执行迁移时不能验收实际公告写入。

针对本功能的离线测试：

```sh
pnpm --filter backend exec node jest.js --config jest.config.unit.cjs --runInBand --runTestsByPath test/unit/AgentModelAnnouncements.ts
pnpm --filter frontend exec vitest run test/agent-model-announcements.test.ts
```

类型、lint、实体与迁移检查遵循 [CI 检查清单](ci-checklist.md)。真实库验收应确认：保存模型后生成更新、手动公告发布、首次进入弹窗、确认后再次进入不重复，以及跨浏览器的已读状态。
