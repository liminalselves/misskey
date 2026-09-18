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
import { applyAgentControlBootstrapAppearance } from '@/utility/agent-control-embed.js';

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

function reveal(): void {
	if (revealed.value) return;
	revealed.value = true;
	window.removeEventListener('message', onHostMessage);
	window.document.documentElement.style.removeProperty('background');
	window.document.body.style.removeProperty('background');
}

function onHostMessage(event: MessageEvent): void {
	if (event.source !== window.parent || event.data == null || typeof event.data !== 'object') return;
	const type = (event.data as { type?: unknown }).type;
	if (type === 'misskey:agent-control:configure' || type === 'misskey:agent-control:update-appearance' || type === 'misskey:agent-control:update-token') {
		reveal();
	}
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
	min-height: 100%;
	background: var(--MI_THEME-bg);
	font-family: var(--agent-control-font-family, inherit);
	font-size: var(--agent-control-font-size, inherit);
}

.root {
	min-height: 100dvh;
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
}

.pending {
	box-sizing: border-box;
	width: min(100%, var(--agent-control-content-max-width, 760px));
	margin-inline: auto;
	padding: var(--agent-control-spacing, var(--MI-margin));
}
</style>
