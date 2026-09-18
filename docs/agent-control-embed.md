# 智能体托管控制台嵌入

msk 为智能体会话配置提供独立的托管页面。宿主项目只负责自己的抽屉、导航和聊天界面，不需要复制模型、记忆、规则等配置 UI，也不需要逐个接入内部 API。

## 可用面板

| 面板 | URL 中的 `panel` |
| --- | --- |
| 模型 | `model` |
| 生图 | `draw` |
| 主动消息 | `proactive` |
| 记忆 | `memory` |
| 世界书 | `worldbook` |
| 规则 | `rules` |
| 对话风格 | `style` |
| 会话 | `operations` |

每个面板使用独立 URL：

```text
https://<msk-origin>/agents/embed/<sessionId>/<panel>
```

聊天、消息列表和搜索不属于托管控制台。宿主项目继续使用自己的聊天 UI。

## 推荐接入方式

加载 msk 提供的宿主脚本：

```html
<script src="https://<msk-origin>/agent-control-embed.js"></script>
```

在项目自己的抽屉容器中挂载：

```js
const control = new window.MisskeyAgentControl({
  origin: 'https://<msk-origin>',
  sessionId: currentSessionId,
  panel: 'memory',
  token: async () => getAgentControlToken(),
  appearance: {
    colorScheme: 'dark',
    accent: '#7dd3fc',
    background: '#0b1220',
    panel: '#111c2f',
    foreground: '#e5edf8',
    muted: '#91a0b7',
    divider: '#26344a',
    radius: '16px',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: '14px',
    contentMaxWidth: '860px',
    spacing: '20px',
    cssVariables: {
      '--MI_THEME-link': '#38bdf8',
      '--MI_THEME-warn': '#fbbf24',
    },
  },
  onEvent(message) {
    if (message.type === 'misskey:agent-control:navigate-message') {
      openProjectChatAtMessage(message.messageId);
    }
    if (message.type === 'misskey:agent-control:navigate-context-divider') {
      openProjectChatAtContextDivider(message.messageId);
    }
    if (message.type === 'misskey:agent-control:open-url') {
      openProjectRouteOrExternalPage(message.url);
    }
    if (message.type === 'misskey:agent-control:close-requested') {
      closeProjectDrawer();
    }
    if (message.type === 'misskey:agent-control:api-success') {
      refreshProjectAgentSummary();
    }
  },
});

control.mount(document.querySelector('#agent-control-drawer'));
```

关闭抽屉并释放资源：

```js
control.destroy();
```

嵌入页在启动阶段不会显示 msk Logo 或全局圆环加载器。宿主脚本会把不含令牌的初始外观附加到 iframe URL，使同步路由壳在完整控制台代码下载期间就能显示与当前项目颜色、圆角和间距一致的中性骨架；令牌仍只通过 `postMessage` 传递。令牌和面板数据准备完成后再展示真实内容。

URL 未携带 `appearance` 参数时，iframe 在收到首条 `configure`/`update-appearance`/`update-token` 消息前保持整页透明、不绘制任何内容，启动阶段完全由宿主自己的占位 UI 覆盖；握手完成后再以宿主外观显示骨架与面板。若宿主始终不提供外观配置，表面色回落到无品牌倾向的中性灰（明暗各一套），不会透出 msk 默认主题色。

宿主切换主题时无需重载 iframe：

```js
control.setAppearance({
  colorScheme: 'light',
  accent: '#2563eb',
  background: '#f8fafc',
  panel: '#ffffff',
  foreground: '#172033',
  radius: '10px',
});
```

令牌轮换时同样无需重载：

```js
control.setToken(await getFreshAgentControlToken());
```

切换面板也无需重载，iframe 内部直接跳转路由，远快于销毁重建：

```js
control.setPanel('worldbook');
```

## 构造参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `origin` | `string` | msk 实例源，例如 `https://misskey.example.com` |
| `sessionId` | `string` | 要配置的智能体会话 ID |
| `panel` | `string` | 上表中的一个面板标识 |
| `token` | `string \| () => string \| Promise<string>` | msk API 访问令牌；推荐传异步函数并按需取得短期令牌 |
| `appearance` | `object` | 初始外观配置 |
| `className` | `string` | iframe 的 CSS class |
| `title` | `string` | iframe 的无障碍标题 |
| `autoHeight` | `boolean` | 是否根据内容自动调整 iframe 高度，默认 `true` |
| `minHeight` | `number` | 自动高度下限，默认 `320` |
| `maxHeight` | `number` | 自动高度上限，默认无限制 |
| `onEvent` | `(message) => void` | 接收保存、导航、关闭和错误事件 |

当项目自己的抽屉拥有固定高度时，建议设置 `autoHeight: false`，并用项目 CSS 给 iframe 或容器设置 `height: 100%`。

## 外观配置

`appearance` 支持以下字段：

- `colorScheme`: `light`、`dark` 或 `auto`
- `accent`: 强调色
- `background`: 页面背景色
- `panel`: 卡片和面板背景色
- `foreground`: 主文字色
- `muted`: 次要文字色
- `divider`: 边框和分隔线色
- `radius`: 全局圆角
- `fontFamily`: 字体族
- `fontSize`: 基础字号
- `contentMaxWidth`: 内容最大宽度
- `spacing`: 页面外围间距
- `cssVariables`: 其他 CSS 自定义属性。属性名必须以 `--` 开头

页面业务结构仍由 msk 托管。不同项目应优先通过以上变量改变视觉风格；如果某个项目需要不同的信息层级或交互结构，应在 msk 中增加新的显式配置项，而不是由宿主覆盖内部类名。

## 低层 `postMessage` 协议

不使用宿主脚本时，宿主可自行创建 iframe，并在收到 ready 后发送凭证：

```js
const iframe = document.querySelector('#agent-control-frame');
const mskOrigin = 'https://<msk-origin>';

window.addEventListener('message', event => {
  if (event.origin !== mskOrigin || event.source !== iframe.contentWindow) return;

  if (event.data?.type === 'misskey:agent-control:ready') {
    iframe.contentWindow.postMessage({
      type: 'misskey:agent-control:configure',
      token: agentControlToken,
      appearance: { colorScheme: 'dark', accent: '#7dd3fc' },
    }, mskOrigin);
  }
});
```

父页面可发送：

- `misskey:agent-control:configure`: 首次提供 `token` 和可选 `appearance`
- `misskey:agent-control:update-appearance`: 运行时更新 `appearance`
- `misskey:agent-control:update-token`: 运行时更新 `token`
- `misskey:agent-control:set-panel`: 切换面板（携带 `panel`），嵌入页内部跳转路由，不重载 iframe

iframe 会发送：

- `misskey:agent-control:ready`
- `misskey:agent-control:authenticated`
- `misskey:agent-control:height`
- `misskey:agent-control:api-success`
- `misskey:agent-control:navigate-message`
- `misskey:agent-control:navigate-context-divider`
- `misskey:agent-control:open-url`
- `misskey:agent-control:close-requested`
- `misskey:agent-control:error`

所有消息都必须校验 `event.origin` 和 `event.source`。宿主脚本已经代为执行这些检查。

## 认证

嵌入页不会从 URL、查询参数或片段读取令牌，也不会持久化宿主注入的令牌。令牌只保存在 iframe 的当前内存中，刷新或销毁 iframe 后失效。

嵌入页在 iframe 中不会自动使用浏览器里现存的 msk 登录账号。宿主必须显式注入令牌。直接在 msk 顶层打开嵌入 URL 进行本地调试时，才会使用当前 msk 登录账号。

令牌至少需要相应接口的 `read:chat` 和 `write:chat` 权限。生产接入应使用作用域化的 MiAuth/OAuth 访问令牌，不应把用户的原生账号令牌写进宿主前端源码。
