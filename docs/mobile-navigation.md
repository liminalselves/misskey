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

## 网盘文件夹导航

- `/my/drive` 页面开启 `MkDrive.navigateByRoute`；进入目录和点击面包屑通过注入 router.pushByPath 写入历史。浏览器/App 返回按浏览轨迹恢复目录；根目录再返回时离开网盘。文件详情返回也恢复原目录。
- `/my/drive/folder/:folder` 的 `folder` prop 传给 `initialFolder`；初次加载不新增历史，该路由启用 `reuseComponent`，参数变化只切换目录。迟到的文件夹请求不得覆盖返回后恢复的目录。
- 删除当前目录用 replace 回到父目录，不保留被删目录作为当前历史项。文件/文件夹选择器与普通网盘浮窗不启用路由导航，继续内部切换。

## 变更边界

导航修复只改网页端，不改 App、后端、数据库或依赖；验证不得操作开发库/生产库，测试接口使用模拟数据。新增缓存或修改公共路由历史需单独核对停用、订阅与状态恢复行为。

## 滚动分页

- 共用 `Paginator` 的 `limit` 模式按本次实际请求数量判断末页；`safe` 模式允许不足一页的有效结果，空页或整页重复则停止。offset 记录已消费的接口条数，不从去重、删除或裁剪后的显示列表长度反推；重新加载重置 offset 和两向结束状态。
- `MkPagination`、时间线、通知、网盘与治理列表在加载或失败时将 `v-appear` 置为 null，成功且仍有下一页时重新观察；失败保留手动重试。`appear` 必须响应绑定更新，停用/卸载取消延迟回调，不能只在首次 mounted 读取设置。
- 分页加载保留已显示条目和加载控件高度，不用大号 `MkLoading` 替换整段列表或按钮。用户分页调用 `fetchNewer({ pagination: true })`，结束后不再请求；时间线轮询不带该选项，仍可发现新消息，且不会清除历史分页失败态触发自动重试。
- 智能体广场的角色/风格追加加载保留卡片，末尾预留 64px 状态区；搜索时不加载被隐藏的广场列表。治理消息检索只在初次空列表加载时显示整块加载指示。
- 2026-10-06：`pnpm --filter frontend test pagination.test.ts drive-navigation.test.ts scroll.test.ts` 共 23 项通过，frontend typecheck 通过，改动源码 ESLint 无错误（存量警告保留）。Chrome 393×852 移动视口使用实际搜索页/用户列表、时间线、通知、反向分页和广场组件，配合模拟 API 验证失败不自动重试、按钮与页面高度/scrollY 不变、手动重试后末页停止、重复页停止及广场加载时卡片不消失。无数据库操作；未替代 Android WebView 真机验收。

## 验证

自动化：`pnpm --filter frontend test drive-navigation.test.ts navigation-state.test.ts scroll.test.ts`、frontend typecheck、改动 src 文件 ESLint、git diff --check。回归覆盖站内历史/独立窗口、移动判定、父容器复用、子页缓存隔离、标签更新、管理菜单往返、无锚点/反向滚动、锚点偏移、离开时取消恢复及首次深链位置；网盘另覆盖目录逐级返回/前进、文件详情返回、目录直达、面包屑、迟到响应、删除目录 replace 和两类选择器隔离。

2026-10-04：Chrome 真实浏览器、393×852 移动视口验证网盘目录进入/逐级返回/前进、文件详情返回、目录地址刷新与根目录面包屑，均通过。使用工作区实际页面/组件/路由与模拟网盘接口，无数据库操作；此结果不替代 App 原生返回键验收。

真机验收（未执行）：

1. 在治理会话列表设置筛选、加载更多并滚动；打开会话后分别用顶栏返回、横幅返回、手机返回键，确认原标签、筛选、已加载行和位置保留。
2. 从消息检索、外审、复审、图片列表打开会话，确认 messageId 定位和返回来源。
3. 手机管理员用户/文件查找应打开页面，手机返回键回到列表；电脑应仍打开浮窗。
4. 手机管理菜单、列表、详情连续往返；电脑新标签直达审查页的页面返回应落到会话列表，不退出站点。
5. 用户聊天深链定位及负 scrollTop 的聊天列表往返；用户设置子页返回。
6. 网盘从根目录进入文件夹后按 App 返回键，应回根目录；进入多级目录则逐级返回。打开文件详情后返回应恢复原目录；文件选择弹窗内浏览不应改变宿主页面地址。

缓存上限、整页刷新与 App 进程回收会丢失内存列表；本次不将完整管理结果持久化到 localStorage，也不承诺修复所有移动端交互。
