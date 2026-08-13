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
	<template #header>{{ i18n.ts._agents.auditFeedbackTitle }}</template>

	<div :class="$style.root">
		<div :class="$style.hero">
			<div :class="$style.icon"><i class="ti ti-shield-x"></i></div>
			<div>
				<div :class="$style.title">{{ title }}</div>
				<p :class="$style.guide">{{ guide }}</p>
			</div>
		</div>

		<dl :class="$style.details">
			<template v-if="category">
				<dt>{{ i18n.ts._agents.auditFeedbackCategory }}</dt>
				<dd>{{ category }}</dd>
			</template>
			<template v-if="reason">
				<dt>{{ i18n.ts._agents.auditFeedbackReason }}</dt>
				<dd>{{ reason }}</dd>
			</template>
			<dt>{{ i18n.ts._agents.auditFeedbackBlockCode }}</dt>
			<dd><code>{{ blockCode || i18n.ts._agents.auditFeedbackUnknown }}</code></dd>
		</dl>

		<div :class="$style.notice">
			<i class="ti ti-bulb"></i>
			<span>{{ i18n.ts._agents.auditFeedbackNotice }}</span>
		</div>

		<MkButton primary rounded :class="$style.button" @click="close">{{ i18n.ts._agents.auditFeedbackBackToEdit }}</MkButton>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';

withDefaults(defineProps<{
	title?: string;
	guide?: string;
	blockCode?: string | null;
	category?: string | null;
	reason?: string | null;
}>(), {
	title: () => i18n.ts._agents.auditFeedbackTitleDefault,
	guide: () => i18n.ts._agents.auditFeedbackGuideDefault,
	blockCode: null,
	category: null,
	reason: null,
});

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

function close() {
	dialog.value?.close();
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

.button {
	align-self: center;
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
