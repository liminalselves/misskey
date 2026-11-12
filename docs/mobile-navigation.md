# 移动端导航与列表恢复

## 行为契约

- 智能体会话审查：电脑仍开新标签页；窄屏、粗指针设备与 `LiminalSelvesApp` 使用注入路由的站内跳转，保留 `messageId` 深链。
- 管理页面的 `os.pageWindow('/admin/...')`：相同移动判定下走 mainRouter，电脑仍用页面浮窗。普通确认框、选择器和非管理浮窗不变。
- 页面返回使用 `goBackInApp`：主路由有明确的站内历史时退回上一条；直达页及独立窗口路由使用 fallback 的 replace，不新增“返回后再返回详情”的循环。审查页顶栏与横幅共享该逻辑，无历史时回到 `?view=sessions`。
- 管理页和设置子页在宽度小于 600px 时自动显示返回按钮。业务显式 `showBack` / `backPath` 优先。
- 治理、智能体设置与 `/chat` 标签从路由 `view` prop 初始化，通过注入 router.replaceByPath 更新，不直接操作浏览器 history。`?view=` 支持刷新与直达恢复；标签切换不增加返回步骤、不重建页面。聊天首页不带 `view`，其他标签包括私信（`directMessages`）；未知或当前不可用的标签回到首页。

## 状态归属

- 浏览器历史仅由 `router-history.ts` 绑定主路由维护。`history.state.misskeyNavigation.index` 表示站内历史深度，replace 保留深度和其他 state；不能用 `history.length` 或 state 非空代替站内历史判断。
- `RouterView` 的嵌套路由父容器以 route.path 为缓存键，避免初次打开的子页 URL 与返回 URL 不同导致另建父容器。
- `NestedRouterView` 仅处理自身父路由下的事件。`reuseComponent` 标签页用 route.path 为键；其他路由仍按完整 URL 区分参数。
- 子页缓存是显式 `route.cache: true`，数量沿用 `numberOfPageCache`（默认 3）。已启用：治理、用户、文件、联邦、举报、管理日志。它保留筛选、已加载分页和组件内状态；刷新、缓存淘汰或 App 进程重建不在保留范围。
- 编辑页、角色页（含基础策略表单与需重新读取的角色列表）、实时队列/仪表盘不缓存，避免旧表单、过期列表和持续订阅。新增缓存前必须审查停用时的定时器、流事件和修改后数据刷新。
- 管理菜单切换用 v-show 保持 NestedRouterView 的缓存容器存活。管理/设置父页忽略离开 DOM 或零宽的 ResizeObserver 回调，重定向前确认当前仍属自身路由。
- `useScrollPositionKeeper` 记录真实 scrollTop/scrollLeft（包括反向聊天的负值）。有可见锚点时保留相对偏移，无锚点或锚点消失时使用坐标。首次激活不覆盖深链定位；停用时取消恢复定时器，卸载/换节点时移除监听。

## App 行为依据

Android `NativeWebViewActivity.kt` 的 onCreateWindow 将站内 `window.open` 交给 handleWindowOpenUrl，最终调用当前 WebView.loadUrl；原生返回键以 WebView.canGoBack/goBack 处理。因此强制新窗口会变成整页加载，而不是保留前端状态的路由跳转，导航一律走站内路由。App 真机行为（原生手势、弹窗返回）尚未验收。

## 网盘文件夹导航

- `/my/drive` 页面开启 `MkDrive.navigateByRoute`；进入目录和点击面包屑通过注入 router.pushByPath 写入历史。浏览器/App 返回按浏览轨迹恢复目录；根目录再返回时离开网盘。文件详情返回也恢复原目录。
- `/my/drive/folder/:folder` 的 `folder` prop 传给 `initialFolder`；初次加载不新增历史，该路由启用 `reuseComponent`，参数变化只切换目录。迟到的文件夹请求不得覆盖返回后恢复的目录。
- 删除当前目录用 replace 回到父目录，不保留被删目录作为当前历史项。文件/文件夹选择器与普通网盘浮窗不启用路由导航，继续内部切换。

## 变更边界

导航契约只涉及网页端，不改 App 桥协议、后端、数据库或依赖。新增缓存或修改公共路由历史需核对停用、订阅与状态恢复行为。

## 嵌入播放器全屏

- `MkUrlPreview` 的播放器 iframe 固定声明 `allowfullscreen`，不依赖预览服务是否在 `player.allow` 中返回 `fullscreen`；仍按原白名单筛选其他 iframe 权限，不放宽 sandbox。它与窗口播放器使用相同的全屏声明。
- Android 的全屏显示与返回键退出由 App 的 `WebChromeClient` 回调负责，网页端不改变桥协议。旧 WebView 与 App 真机尚未验收。

## 滚动分页

- 共用 `Paginator` 的 `limit` 模式按本次实际请求数量判断末页；`safe` 模式允许不足一页的有效结果，空页或整页重复则停止。offset 记录已消费的接口条数，不从去重、删除或裁剪后的显示列表长度反推；重新加载重置 offset 和两向结束状态。
- `MkPagination`、时间线、通知、网盘与治理列表在加载或失败时将 `v-appear` 置为 null，成功且仍有下一页时重新观察；失败保留手动重试。`appear` 必须响应绑定更新，停用/卸载取消延迟回调，不能只在首次 mounted 读取设置。
- 分页加载保留已显示条目和加载控件高度，不用大号 `MkLoading` 替换整段列表或按钮。用户分页调用 `fetchNewer({ pagination: true })`，结束后不再请求；时间线轮询不带该选项，仍可发现新消息，且不会清除历史分页失败态触发自动重试。
- 智能体广场的角色/风格追加加载保留卡片，末尾预留 64px 状态区；搜索时不加载被隐藏的广场列表。治理消息检索只在初次空列表加载时显示整块加载指示。
- 智能体聊天的 `agent-opt:` 临时消息仅供本地显示，不作两向分页游标；没有正式消息时暂不分页。发送、分段播放或通知同步期间到达的同会话通知合并为待同步通知，发送状态复位或当前同步结束后补拉，不依赖下一条通知；延后的通知不提前清未读，后台同步仍不清未读，卸载后不补拉。发送失败仍沿用原有时间线重载与草稿恢复。回归：`pnpm --filter frontend exec vitest run test/agent-session-message-sync.test.ts`。

## 验证

`pnpm --filter frontend test drive-navigation.test.ts navigation-state.test.ts scroll.test.ts pagination.test.ts`，再加 frontend typecheck 与改动文件的 ESLint。回归覆盖站内历史/独立窗口、移动判定、父容器复用、子页缓存隔离、标签更新、管理菜单往返、无锚点/反向滚动、锚点偏移、离开时取消恢复及首次深链位置；网盘另覆盖目录逐级返回/前进、文件详情返回、目录直达、面包屑、迟到响应、删除目录 replace 和两类选择器隔离。测试用模拟接口，不操作开发库或生产库。

真机验收清单（未执行）：

1. 在治理会话列表设置筛选、加载更多并滚动；打开会话后分别用顶栏返回、横幅返回、手机返回键，确认原标签、筛选、已加载行和位置保留。
2. 从消息检索、外审、复审、图片列表打开会话，确认 messageId 定位和返回来源。
3. 手机管理员用户/文件查找应打开页面，手机返回键回到列表；电脑应仍打开浮窗。
4. 手机管理菜单、列表、详情连续往返；电脑新标签直达审查页的页面返回应落到会话列表，不退出站点。
5. 用户聊天深链定位及负 scrollTop 的聊天列表往返；用户设置子页返回。
6. 网盘从根目录进入文件夹后按 App 返回键，应回根目录；进入多级目录则逐级返回。打开文件详情后返回应恢复原目录；文件选择弹窗内浏览不应改变宿主页面地址。

缓存上限、整页刷新与 App 进程回收会丢失内存列表；管理结果不持久化到 localStorage。
