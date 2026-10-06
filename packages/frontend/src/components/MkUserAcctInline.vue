<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- 治理相关页面共用：用户名/acct 行内展示 + 点击复制 -->
<template>
<span :class="$style.root">
	<code>{{ displayAcct || '-' }}</code>
	<button type="button" :class="$style.copy" class="_button" title="复制用户名" :disabled="!canCopy" @click.stop="copy">
		<i class="ti ti-copy"></i>
	</button>
</span>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { acct as userAcct } from '@/filters/user.js';
import * as os from '@/os.js';

const props = defineProps<{
	user?: Misskey.entities.UserLite | null;
	fallback?: string | null;
}>();

const displayAcct = computed(() => props.user ? `@${userAcct(props.user)}` : (props.fallback ?? ''));
const canCopy = computed(() => displayAcct.value !== '' && displayAcct.value !== '-');

function copy() {
	if (!canCopy.value) return;
	copyToClipboard(displayAcct.value);
	os.toast('已复制');
}
</script>

<style lang="scss" module>
.root {
	display: inline-flex;
	align-items: center;
	max-width: 100%;
	gap: 4px;
	vertical-align: middle;
}
.root code {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.copy {
	display: inline-grid;
	place-items: center;
	flex: 0 0 auto;
	width: 24px;
	height: 24px;
	border-radius: 6px;
	color: var(--MI_THEME-fgTransparentWeak);
}
.copy:hover {
	color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
}
.copy:disabled {
	opacity: 0.45;
	cursor: default;
}
</style>
