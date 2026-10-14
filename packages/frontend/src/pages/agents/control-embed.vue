<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" :style="revealed ? undefined : { visibility: 'hidden' }">
	<Suspense>
		<XControlContent :sessionId="sessionId" :panel="panel"/>
		<template #fallback>
			<div :class="$style.pending">
				<XControlLoading/>
			</div>
		</template>
	</Suspense>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, onBeforeUnmount, ref } from 'vue';
import XControlLoading from '@/pages/agents/control-embed-loading.vue';
import { applyAgentControlBootstrapAppearance, createAgentControlParentGuard } from '@/utility/agent-control-embed.js';

defineProps<{
	sessionId: string;
	panel: string;
}>();

applyAgentControlBootstrapAppearance();

const XControlContent = defineAsyncComponent(() => import('@/pages/agents/control-embed-content.vue'));

// 握手完成前整页透明：URL 未携带外观时，宿主 appearance 到达前不绘制任何内容，由宿主自己的占位覆盖启动阶段
const isFramed = window.parent !== window;
const hasBootstrapAppearance = new URLSearchParams(window.location.search).has('appearance');
const revealed = ref(!isFramed || hasBootstrapAppearance);
// 与内容组件同一套 source+origin 守卫（reveal 消息本身不含敏感数据，但保持同一校验口径）
const parentGuard = createAgentControlParentGuard();

function reveal(): void {
	if (revealed.value) return;
	revealed.value = true;
	window.removeEventListener('message', onHostMessage);
	window.document.documentElement.style.removeProperty('background');
	window.document.body.style.removeProperty('background');
}

function onHostMessage(event: MessageEvent): void {
	if (!parentGuard.accept(event)) return;
	reveal();
}

if (!revealed.value) {
	window.addEventListener('message', onHostMessage);
	window.document.documentElement.style.setProperty('background', 'transparent');
	window.document.body.style.setProperty('background', 'transparent');
}

onBeforeUnmount(() => {
	window.removeEventListener('message', onHostMessage);
});
</script>

<style lang="scss" module>
:global(html),
:global(body) {
	background: var(--MI_THEME-bg);
	font-family: var(--agent-control-font-family, inherit);
	font-size: var(--agent-control-font-size, inherit);
}

// 嵌入页只在 iframe 内使用：不能有任何视口相对的最小高度，
// 否则 iframe 变高后 scrollHeight 被地板顶住，autoHeight 再也无法收缩。
.root {
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
}

.pending {
	box-sizing: border-box;
	width: min(100%, var(--agent-control-content-max-width, 100%));
	margin-inline: auto;
	padding: var(--agent-control-spacing, var(--MI-margin));
}
</style>
