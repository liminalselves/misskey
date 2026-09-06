<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="520"
	@close="close"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts._agents.modelFailureTitle }}</template>

	<div :class="$style.root">
		<div :class="$style.hero">
			<div :class="$style.icon"><i :class="heroIcon"></i></div>
			<div>
				<div :class="$style.title">{{ title }}</div>
				<p :class="$style.guide">{{ guide }}</p>
			</div>
		</div>

		<dl :class="$style.details">
			<dt>{{ i18n.ts._agents.modelFailureKind }}</dt>
			<dd><i :class="['ti ti-circle-filled', $style.kindDot]"></i> {{ kindLabel }}</dd>
			<template v-if="reason">
				<dt>{{ i18n.ts._agents.modelFailureReason }}</dt>
				<dd>{{ reason }}</dd>
			</template>
			<template v-if="status != null">
				<dt>{{ i18n.ts._agents.modelFailureHttpStatus }}</dt>
				<dd><code>HTTP {{ status }}</code></dd>
			</template>
			<template v-if="detail">
				<dt>{{ i18n.ts._agents.modelFailureDetail }}</dt>
				<dd :class="$style.detail">{{ detail }}</dd>
			</template>
			<dt>{{ i18n.ts._agents.modelFailureCode }}</dt>
			<dd><code>{{ code || i18n.ts._agents.auditFeedbackUnknown }}</code></dd>
		</dl>

		<div :class="$style.notice">
			<i class="ti ti-bulb"></i>
			<span>{{ notice }}</span>
		</div>

		<div :class="$style.buttons">
			<MkButton v-if="retryable" primary rounded :class="$style.button" @click="retry">
				<i class="ti ti-refresh"></i> {{ i18n.ts._agents.modelFailureRetry }}
			</MkButton>
			<MkButton rounded :class="$style.button" @click="close">{{ i18n.ts._agents.auditFeedbackBackToEdit }}</MkButton>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	title?: string;
	guide?: string;
	code?: string | null;
	reason?: string | null;
	status?: number | null;
	detail?: string | null;
	/** 关闭按钮旁是否提供「重试」 */
	retryable?: boolean;
}>(), {
	title: () => i18n.ts._agents.modelFailureTitleDefault,
	guide: () => i18n.ts._agents.modelFailureGuideDefault,
	code: null,
	reason: null,
	status: null,
	detail: null,
	retryable: true,
});

const emit = defineEmits<{
	(ev: 'retry'): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

const kindLabel = computed(() => {
	switch (props.code) {
		case 'AGENTS_LLM_TIMEOUT': return i18n.ts._agents.modelFailureKindTimeout;
		case 'AGENTS_LLM_UNSAFE_URL': return i18n.ts._agents.modelFailureKindUnsafeUrl;
		case 'AGENTS_MODEL_NOT_CONFIGURED': return i18n.ts._agents.modelFailureKindNotConfigured;
		case 'AGENTS_LLM_FAILED': return i18n.ts._agents.modelFailureKindUpstream;
		default: return i18n.ts._agents.modelFailureKindUnknown;
	}
});

/** 超时用时钟图标、其余用感叹号，与外审弹窗的盾牌图标同规格 */
const heroIcon = computed(() => props.code === 'AGENTS_LLM_TIMEOUT' ? 'ti ti-clock-x' : 'ti ti-alert-triangle');

const notice = computed(() => props.code === 'AGENTS_LLM_TIMEOUT'
	? i18n.ts._agents.modelFailureNoticeTimeout
	: i18n.ts._agents.modelFailureNoticeDefault);

function close() {
	dialog.value?.close();
}

function retry() {
	emit('retry');
	close();
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 1em;
	padding: 1.4em;
}

.hero {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: center;
	gap: 1em;
}

.icon {
	display: grid;
	place-items: center;
	width: 3.4em;
	height: 3.4em;
	border-radius: 50%;
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 14%, transparent);
	font-size: 1.35em;
}

.title {
	font-size: 1.08em;
	font-weight: 700;
}

.guide {
	margin: 0.3em 0 0;
	color: var(--MI_THEME-fgTransparentWeak);
	line-height: 1.5;
}

.details {
	display: grid;
	grid-template-columns: max-content minmax(0, 1fr);
	gap: 0.55em 0.9em;
	margin: 0;
	padding: 1em;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: color-mix(in srgb, var(--MI_THEME-bg) 35%, transparent);
}

.details dt {
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
}

.details dd {
	min-width: 0;
	margin: 0;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.kindDot {
	font-size: 0.6em;
	vertical-align: 0.15em;
	color: var(--MI_THEME-error);
}

.detail {
	font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;
	font-size: 0.9em;
}

.notice {
	display: flex;
	align-items: flex-start;
	gap: 0.6em;
	padding: 0.8em 0.9em;
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 10%, transparent);
	line-height: 1.5;
}

.notice i {
	margin-top: 0.15em;
	flex-shrink: 0;
}

.buttons {
	display: flex;
	justify-content: center;
	flex-wrap: wrap;
	gap: 0.7em;
}

.button {
	min-width: 9em;
}

@media (max-width: 500px) {
	.root {
		padding: 1em;
	}

	.details {
		grid-template-columns: 1fr;
		gap: 0.2em;
	}

	.details dd + dt {
		margin-top: 0.55em;
	}
}
</style>
