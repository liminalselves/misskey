<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="520" @close="closeDialog" @closed="emit('closed')" @esc="closeDialog">
	<template #header>{{ i18n.ts._agents.byokProviderDialogTitle }}</template>
	<div :class="$style.body">
		<p :class="$style.caption">{{ i18n.ts._agents.byokProviderDialogCaption }}</p>
		<div :class="$style.list">
			<button
				v-for="p in providers"
				:key="p.id"
				type="button"
				class="_button"
				:class="$style.item"
				@click="choose(p)"
			>
				<span :class="$style.itemIcon"><i class="ti ti-server-2"></i></span>
				<span :class="$style.itemMain">
					<span :class="$style.itemName">{{ p.name }}</span>
					<span v-if="p.description" :class="$style.itemDesc">{{ p.description }}</span>
					<span :class="$style.itemHost">{{ hostOf(p.baseUrl) }}</span>
				</span>
				<i class="ti ti-chevron-right" :class="$style.itemChevron"></i>
			</button>
			<button type="button" class="_button" :class="$style.item" @click="choose(null)">
				<span :class="$style.itemIcon"><i class="ti ti-adjustments"></i></span>
				<span :class="$style.itemMain">
					<span :class="$style.itemName">{{ i18n.ts._agents.byokProviderCustom }}</span>
					<span :class="$style.itemDesc">{{ i18n.ts._agents.byokProviderCustomDesc }}</span>
				</span>
				<i class="ti ti-chevron-right" :class="$style.itemChevron"></i>
			</button>
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import MkModalWindow from '@/components/MkModalWindow.vue';
import { useTemplateRef } from 'vue';
import { i18n } from '@/i18n.js';

type Provider = {
	id: string;
	name: string;
	description?: string | null;
	baseUrl: string;
	apiModelName?: string | null;
	maxContextTokens?: number | null;
	maxOutputTokensPerCall?: number | null;
	tokenizerEncoding?: string | null;
	charsPerToken?: number | null;
};

defineProps<{
	providers: Provider[];
}>();

const emit = defineEmits<{
	(ev: 'selected', provider: Provider | null): void;
	(ev: 'closed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');

function closeDialog() {
	dialogEl.value?.close();
}

function hostOf(baseUrl: string): string {
	try {
		return new URL(baseUrl).host;
	} catch {
		return baseUrl;
	}
}

function choose(provider: Provider | null) {
	emit('selected', provider);
	closeDialog();
}
</script>

<style lang="scss" module>
.body {
	padding: 16px;
}

.caption {
	margin: 0 0 12px;
	font-size: 0.85em;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparentWeak);
}

.list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.item {
	display: flex;
	align-items: center;
	gap: 12px;
	width: 100%;
	padding: 12px;
	border-radius: 10px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	text-align: left;
	transition: border-color 0.15s ease, background 0.15s ease;

	&:hover {
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 45%, var(--MI_THEME-divider));
		background: color-mix(in srgb, var(--MI_THEME-accent) 6%, var(--MI_THEME-panel));
	}
}

.itemIcon {
	flex-shrink: 0;
	width: 40px;
	height: 40px;
	border-radius: 10px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.25rem;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.itemMain {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.itemName {
	font-weight: 700;
	line-height: 1.35;
}

.itemDesc {
	font-size: 0.82em;
	line-height: 1.4;
	color: var(--MI_THEME-fgTransparentWeak);
}

.itemHost {
	font-size: 0.78em;
	font-family: monospace;
	color: var(--MI_THEME-fgTransparentWeak);
}

.itemChevron {
	flex-shrink: 0;
	opacity: 0.4;
}
</style>
