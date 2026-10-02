# 移动端导航与列表恢复

## 行为契约

- 智能体会话审查：电脑仍开新标签页；窄屏、粗指针设备与 `LiminalSelvesApp` 使用注入路由的站内跳转，保留 `messageId` 深链。
- 管理页面的 `os.pageWindow('/admin/...')`：相同移动判定下走 mainRouter，电脑仍用页面浮窗。普通确认框、选择器和非管理浮窗不变。
- 页面返回使用 `goBackInApp`：主路由有明确的站内历史时退回上一条；直达页及独立窗口路由使用 fallback 的 replace，不新增“返回后再返回详情”的循环。审查页顶栏与横幅共享该逻辑，无历史时回到 `?view=sessions`。
- 管理页和设置子页在宽度小于 600px 时自动显示返回按钮。业务显式 `showBack` / `backPath` 优先。
- 治理标签从路由 `view` prop 初始化，通过注入 router.replaceByPath 更新，不直接操作浏览器 history。标签切换不增加返回步骤、不重建治理页。

## 状态归属

- 浏览器历史仅由 `router-history.ts` 绑定主路由维护。`history.state.misskeyNavigation.index` 表示站内历史深度，replace 保留深度和其他 state；不能用 `history.length` 或 state 非空代替站内历史判断。
- `RouterView` 的嵌套路由父容器以 route.path 为缓存键，避免初次打开的子页 URL 与返回 URL 不同导致另建父容器。
- `NestedRouterView` 仅处理自身父路由下的事件。`reuseComponent` 标签页用 route.path 为键；其他路由仍按完整 URL 区分参数。
- 子页缓存是显式 `route.cache: true`，数量沿用 `numberOfPageCache`（默认 3）。已启用：治理、用户、文件、联邦、举报、管理日志。它保留筛选、已加载分页和组件内状态；刷新、缓存淘汰或 App 进程重建不在保留范围。
- 编辑页、角色页（含基础策略表单与需重新读取的角色列表）、实时队列/仪表盘不缓存，避免旧表单、过期列表和持续订阅。新增缓存前必须审查停用时的定时器、流事件和修改后数据刷新。
- 管理菜单切换用 v-show 保持 NestedRouterView 的缓存容器存活。管理/设置父页忽略离开 DOM 或零宽的 ResizeObserver 回调，重定向前确认当前仍属自身路由。
- `useScrollPositionKeeper` 记录真实 scrollTop/scrollLeft（包括反向聊天的负值）。有可见锚点时保留相对偏移，无锚点或锚点消失时使用坐标。首次激活不覆盖深链定位；停用时取消恢复定时器，卸载/换节点时移除监听。

## App 只读结论

2026-10-01 检查桌面 `liminalselves` 项目。Android `NativeWebViewActivity.kt` 的 onCreateWindow 将站内 window.open 交给 handleWindowOpenUrl，最终调用当前 WebView.loadUrl；原生返回键以 WebView.canGoBack/goBack 处理。因此强制新窗口会变成整页加载，而不是保留前端状态的路由跳转。

本次通过网页端避免该路径，没有修改 App，也没有改变桥协议。无需为本次导航修复重新发布 App。App 真机行为尚未验收；原生手势/弹窗返回及其他未检查流程不能据此宣称已修复。

## 范围与门控

执行为分阶段局部修复，不重写路由：会话入口/返回、嵌套页面缓存、共享滚动各自限定行为。依据为实际调用链、原生只读源码与组件回归测试；授权来自本次“优化并修复”。总预算 18 文件、650 增删行（含测试和文档）；禁止 App、后端、数据库、依赖及 Git 写操作。修复前原有 scroll 单测 2 项通过。新增依赖或必须改 App 时停止；回退仅撤销本次文本修改，不使用 git restore/reset。

参考收据：code-quality-workflow 路由，ST-A0（快照 2026-08-18）；未引入设计目录候选。目标为导航/返回/状态恢复，红线为 App 只读与不改数据库，验收为轻量回归及明确标记真机缺口。

## 验证

自动化：`pnpm --filter frontend test navigation-state.test.ts scroll.test.ts`、frontend typecheck、改动 src 文件 ESLint、git diff --check。回归覆盖站内历史/独立窗口、移动判定、父容器复用、子页缓存隔离、标签更新、管理菜单往返、无锚点/反向滚动、锚点偏移、离开时取消恢复及首次深链位置。

真机验收（未执行）：

1. 在治理会话列表设置筛选、加载更多并滚动；打开会话后分别用顶栏返回、横幅返回、手机返回键，确认原标签、筛选、已加载行和位置保留。
2. 从消息检索、外审、复审、图片列表打开会话，确认 messageId 定位和返回来源。
3. 手机管理员用户/文件查找应打开页面，手机返回键回到列表；电脑应仍打开浮窗。
4. 手机管理菜单、列表、详情连续往返；电脑新标签直达审查页的页面返回应落到会话列表，不退出站点。
5. 用户聊天深链定位及负 scrollTop 的聊天列表往返；用户设置子页返回。

缓存上限、整页刷新与 App 进程回收会丢失内存列表；本次不将完整管理结果持久化到 localStorage，也不承诺修复所有移动端交互。
