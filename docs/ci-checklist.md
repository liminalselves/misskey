# GitHub CI 更新前检查

按实际改动选择下面的检查，不用每次重跑整个仓库。工作流的版本、矩阵和执行步骤以 [`.github/workflows`](../.github/workflows) 为准；本地通过不代表 GitHub 已通过，也不能保证 GitHub 服务、下载源和镜像仓库永远正常。

## 基础检查

- 使用 [`.node-version`](../.node-version) 指定的 Node.js；后端运行时改动还要考虑 [最低版本](../.github/min.node-version)。pnpm 版本以 [`package.json`](../package.json) 的 `packageManager` 为准。
- 依赖或锁文件改动后，安装验收使用 `pnpm install --frozen-lockfile`，不要靠非冻结安装掩盖不一致。安装新依赖仍需单独授权。
- 所有命令从项目根目录执行。结束时运行 `git diff --check`，检查实际 diff，排除临时文件和无关生成结果。

## 前端改动

```sh
pnpm --filter frontend typecheck
pnpm --filter frontend eslint
pnpm --filter frontend exec vitest run test/<affected-test>.test.ts
```

将 `<affected-test>` 换成实际测试名。共享组件、路由、测试初始化或公共依赖改动时，再运行 `pnpm --filter frontend test-and-coverage`。组件挂载测试参照 `test/home.test.ts` 导入 `./init` 初始化语言数据；路由等不挂载组件的纯逻辑测试不要为此引入应用启动和网络请求。

构建验证不能代替 `typecheck`。前端构建及浏览器端到端测试以 [`test-frontend.yml`](../.github/workflows/test-frontend.yml) 为准。

## 后端服务与依赖注入

```sh
pnpm --filter backend build
pnpm --filter backend typecheck
pnpm --filter backend eslint
pnpm --filter backend exec node jest.js --config jest.config.unit.cjs --runInBand --runTestsByPath test/unit/<affected-test>.ts
```

后端构建使用 SWC，不等于 TypeScript 类型检查。最后一条只运行已确认不连接数据库的测试；先读测试的导入、初始化和清理代码。

服务构造函数新增依赖时，搜索该服务的所有 `new Service(...)` 和 `Test.createTestingModule`，包括其他服务的间接依赖。同步真实测试模块的 `providers` 或测试桩，不能只改 `CoreModule`，也不能只跑新增功能的测试。后端的 ESLint 脚本不包含 `test/unit`，测试文件主要由 `typecheck` 和实际 Jest 验证。

2026-10-07 的 CI 中，`ModerationLogService` 新增日志依赖，但 `CustomEmojiService` 测试没有注册 `LoggerService`，使同一套测试的 42 个用例连带失败。后续 `undefined` 清理异常是初始化失败的结果，不是另一项业务缺陷。

**数据库边界：** 导入 `GlobalModule` 的测试可能初始化数据库；测试模式会启用 `synchronize` 和 `dropSchema`。完整后端单测、端到端测试及迁移测试只能在明确授权的隔离测试库或 GitHub CI 中运行，不能因配置文件叫 `test.yml` 就认为安全。助手不得自动运行连接开发库或生产库的测试、查询、`migrate`、`revert`、`check-migrations`。

## misskey.js 公共类型

公共导出、通知类型、治理日志常量或 SDK 类型改动后：

```sh
pnpm --filter misskey-js build
pnpm --filter misskey-js typecheck
pnpm --filter misskey-js api
pnpm --filter misskey-js api-prod
```

`api` 更新 API 报告快照，审查并保留预期的 `etc/misskey-js.api.md` 差异；`api-prod` 才是 CI 的严格验收。只通过 SDK 构建、类型检查或测试，仍可能因报告未同步而失败。本次遗漏的是 `resolveAgentModelReport` 导出。

构建声明文件时不要设置 `NODE_ENV=production`，该模式会跳过 `.d.ts` 生成。前端实际读取 SDK 的 `built` 声明；手改源类型后要同步构建结果。API 报告更新不需要全量重新生成端点类型，避免把其他未对齐的 schema 一起带入补丁。新增逻辑再按 [`test-misskey-js.yml`](../.github/workflows/test-misskey-js.yml) 运行 SDK 测试。

## 实体和迁移

逐项对照 SQL 与实体：列类型和长度、空值、默认值、索引、主外键、外键删除/更新行为，以及 `@Column({ comment })` 的列注释。

- jsonb 的 SQL 默认值必须对应实体的 `default`；存量业务初始值通过回填或代码初始化处理，不要混进不同的结构默认值。
- 实体有列注释，迁移也必须写 `COMMENT ON COLUMN`。TypeORM 会比对注释；本次墓碑表缺少六条注释，连带生成外键删除/重建语句。不要把这些语句全部当成独立的外键错误，更不能关闭结构比对。
- JS 语法检查和离线 SQL/实体比对只能补充静态证据，不能声称真实迁移已通过。最终验收是 [`test-backend.yml`](../.github/workflows/test-backend.yml) 的 Migration job 在全新 PostgreSQL 中执行全部迁移，再确认没有剩余结构差异。
- 本次补齐原迁移针对全新库；已执行过该迁移的库不会自动重跑。存量库补注释需另行确认，不属于本次 CI 修复的数据库操作。

## Docker 与 GitHub 故障分类

Dockerfile、镜像环境变量或构建依赖改动后，按 [`dockle.yml`](../.github/workflows/dockle.yml) 构建镜像并使用相同版本的 Dockle 扫描。构建成功不代表镜像检查通过；多架构构建成功也不代表发布标签已经合并。

Dockle 会按环境变量名匹配疑似凭据。`MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY` 的值是布尔开关，不是密钥，本次仅对完整变量名设置 `--accept-key`。遇到新误报先检查含义和值，只允许精确例外，不能放行通用 `KEY` 或关闭整个 `CIS-DI-0010` 检查。

推送后检查每个 job 和失败步骤，不只看工作流总颜色：

- [`lint.yml`](../.github/workflows/lint.yml) 的 lint/typecheck 允许 `continue-on-error`，总工作流成功不代表各检查通过。
- 一个矩阵任务失败可能取消另一个任务；`cancelled` 不自动代表第二种代码问题。
- amd64/arm64 都成功、有 digest 工件，但合并任务没有启动且页面显示 `Internal server error`，应按 GitHub 服务故障处理。此次镜像发布属于这种情况，不应无证据修改 Dockerfile 或缓存设置。
- Action 的 Node.js 弃用通知、runner 系统升级通知不等于当前失败根因。不要为消除通知混入无关依赖升级。

平台故障可由用户在 Actions 中重跑失败任务；镜像发布重跑会写入外部仓库，助手不得未经当次授权自行触发。
