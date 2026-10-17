# 智能体额度奖励与补偿接口

## 当前范围

后端提供批量签发、额度流水和账单读取支持，接口接收 JSON，不接收文件，不写入网盘。前端「控制面板 → 智能体管理 → 额度」已接入行式批量签发（`pages/admin/agents-settings-credit-grants.vue`，自包含组件，挂载于卡密面板上方）：逐行填写或导入 CSV，确认后调用批量接口；成功行自动移除，失败行保留原文和行级错误供修改后再次发放。旧单人 `issue-reward` 入口仍保留并与批量签发复用 `_issue-grant.ts` 的入账与通知实现，但前端不再调用。

## 批量签发

`POST /api/admin/agents/credits/issue-batch`

- 需要登录及管理员/监察员权限，使用 `write:admin` 权限，沿用既有奖励接口的 `secure` 限制。
- 智能体总开关必须开启；每小时最多 20 次请求，每次 1～200 条。
- `items` 按输入顺序执行；每条独立事务，不是整批原子提交。

```json
{
  "items": [
    {
      "kind": "compensation",
      "userRef": "@alice",
      "amount": 12.5,
      "reason": "模型计费差额补偿"
    },
    {
      "kind": "reward",
      "userRef": "@bob",
      "amount": 5,
      "reason": "活动奖励"
    }
  ]
}
```

| 字段 | 约定 |
| --- | --- |
| `kind` | 必填，`reward`（奖励）或 `compensation`（补偿）。同批可混合。 |
| `userRef` | 必填，1～128 字符，支持数据库用户 ID、`@username`、`@username@host`。首尾空白忽略，账号通过现有 acct 解析器查找，不请求远端创建用户。 |
| `amount` | 必填，JSON 数字，0.01～100000，最多两位小数。只容忍浮点表示误差，不将超出精度的金额静默舍入。 |
| `reason` | 可省略、`null` 或空字符串，最多 200 字符；去除首尾空白后入库，空白原因存为 `null`。原因对收款用户可见。 |

重复用户不会自动去重或合并：同一用户的两行代表两次入账，并分别写流水、发通知。批内相同的用户引用缓存查找结果；每次仍在自己的事务中检查额度账户是否存在。

### 返回结果

```json
{
  "results": [
    {
      "index": 0,
      "kind": "compensation",
      "userRef": "@alice",
      "amount": 12.5,
      "ok": true,
      "userId": "resolvedUserId",
      "newBalance": 42.5
    },
    {
      "index": 1,
      "kind": "reward",
      "userRef": "@nobody",
      "amount": 5,
      "ok": false,
      "error": { "code": "NO_SUCH_USER", "message": "No such user." }
    }
  ],
  "successCount": 1,
  "failCount": 1
}
```

`results` 与输入等长、同序，`index` 从 0 开始。成功项的 `amount` 为规范化后的金额，`newBalance` 为该条事务内读回的余额，不保证此后没有其他扣费或入账。失败项不返回余额。

- 缺少字段、非法类型、数组越界、金额越界或原因超长：参数校验返回请求级 `INVALID_PARAM`，整批尚未执行。
- 用户不存在：该行 `NO_SUCH_USER`；用户存在但没有 profile：该行 `USER_PROFILE_MISSING`。
- 超过两位小数：该行 `INVALID_AMOUNT`，其他行继续执行。
- 数据库等非业务异常：该行 `INTERNAL_ERROR`，详细异常只写服务端日志。
- 未启用智能体或读取通知所需站点配置失败：开始写入前整次请求失败。

客户端只保留响应中失败的行供修正；不能将含成功项的整批再次提交。本接口没有请求幂等键：连接超时、响应丢失或进程中断时，可能已经提交部分行，不能据此自动重发。需要先核对账单；普通事务异常的离线测试不代表已经覆盖数据库提交结果不确定的网络故障。

## 入账、通知与账单

每条签发在同一个 PostgreSQL 事务中执行余额原子递增、写成功流水、读回余额；缺少账户、写流水失败或读回余额失败均回滚该条，不影响已提交或后续的其他行。沿用允许负余额的账户规则，补偿不改变其他计费或免费次数。

- 奖励：`usageKind = admin_reward`。
- 补偿：`usageKind = admin_compensation`。
- 两者均为 `cost = -amount`，不关联模型或会话；沿用既有奖励记录方式，在 `errorCode` 保存原因。模型调用报表通过 `nonModelUsageKinds` 排除奖励、补偿、签到和迁移，不让负费用污染模型消费汇总。
- 用户及管理端账单接口返回正数收入，并在 `modelName` 返回原因；原因为空时，奖励显示「管理员签发」，补偿显示「管理员补偿」。账单 `usageKind` 是前端区分文案和图标的依据。

每条事务提交后调用现有 `app` 通知：奖励标题「奖励入账」，补偿标题「补偿到账」；正文包含两位小数金额与可选原因。通知图标沿用站点图标，类型专属图标留给前端展示。通知失败不将已入账记录改报失败，也不撤销额度。通知服务是异步投递，不提供必达保证。

## CSV 文件约定

文件为 UTF-8，可带 BOM。列顺序固定：`类型,用户,数量,原因`。可有上述中文表头，也可直接从数据行开始；每条记录对应一个 `items` 项，空行跳过，最多 200 条。原因可空，但该列仍应保留。

```csv
类型,用户,数量,原因
补偿,@alice,12.50,模型计费差额补偿
奖励,@bob,5.00,活动奖励
```

- `奖励` / `reward` 转为 `kind: reward`；`补偿` / `compensation` 转为 `kind: compensation`。
- 用户列原样映射到 `userRef`，支持账号或数据库用户 ID。
- 数量为不含千分位分隔符的十进制数字，映射到 `amount`，范围及精度与接口一致。
- 原因中的逗号、双引号、换行使用标准 CSV 引号规则：字段用双引号包裹，内部双引号写成两个双引号。

前端解析器在 `utility/agent-credit-grant-csv.ts`（纯函数）：解析失败的行不进表格，行号与原因在导入提示中列出；有效行超过 200 条时截断并提示。导入会替换当前编辑内容（已有内容时先确认），模板下载按钮生成带 BOM 的示例文件。确认发放后才请求接口。

## 迁移及验证边界

`1784800000000-AgentCreditGrantReasonLength.js` 将 `agent_model_usage_log.errorCode` 从 `varchar(128)` 扩至 `varchar(200)`，实体同步更新；新增 usageKind 本身无需迁移（列是 `varchar(32)`）。部署者须先执行待迁移链再启动新版后端，否则超过 128 字符的原因仍可能写入失败。回滚缩列遇到长原因会被 PostgreSQL 拒绝，不自动截断历史原因。

助手不执行迁移、数据库查询或真实发放。`test/unit/AgentCreditGrant.ts` 使用内存事务替身检查逐行回滚、部分成功、通知时机、参数边界、用户解析和账单；`AgentModelUsageService.ts` 检查补偿不进入模型统计。这些验证不替代真实数据库与通知链路验收。
