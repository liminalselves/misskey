<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span><template v-for="(t, i) in tokens" :key="i"><code v-if="t.type === 'code'" :class="$style.code">{{ t.text }}</code><b v-else-if="t.type === 'strong'">{{ t.text }}</b><a v-else-if="t.type === 'link'" :href="t.href" target="_blank" rel="noopener noreferrer" class="_link">{{ t.text }}</a><template v-else>{{ t.text }}</template></template></span>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { tokenizeInlineMarkdown } from '@/utility/inline-markdown.js';

const props = defineProps<{
	text: string;
}>();

const tokens = computed(() => tokenizeInlineMarkdown(props.text));
</script>

<style lang="scss" module>
.code {
	padding: 0.1em 0.4em;
	border-radius: 4px;
	background: var(--MI_THEME-bg);
	font-size: 0.9em;
	word-break: break-all;
}
</style>
