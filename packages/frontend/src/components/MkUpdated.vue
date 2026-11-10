<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" preferType="dialog" :zPriority="'middle'" @click="modal?.close()" @closed="emit('closed')">
	<div :class="$style.root">
		<div :class="$style.title"><MkSparkle>{{ i18n.ts.misskeyUpdated }}</MkSparkle></div>
		<div :class="$style.version">✨{{ version }}🚀</div>
		<div v-if="isBeta" :class="$style.beta">{{ i18n.ts.thankYouForTestingBeta }}</div>
		<ul v-if="highlights.length > 0" :class="$style.highlights">
			<li v-for="(item, i) in highlights" :key="i"><MkInlineMarkdown :text="item"/></li>
		</ul>
		<MkButton full @click="whatIsNew">查看本站更新日志</MkButton>
		<MkButton :class="$style.gotIt" primary full @click="modal?.close()">{{ i18n.ts.gotIt }}</MkButton>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { onMounted, useTemplateRef } from 'vue';
import { version } from '@@/js/config.js';
import { forkChangelog } from 'virtual:fork-changelog';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkSparkle from '@/components/MkSparkle.vue';
import MkInlineMarkdown from '@/components/MkInlineMarkdown.vue';
import { i18n } from '@/i18n.js';
import { confetti } from '@/utility/confetti.js';
import { mainRouter } from '@/router.js';

const HIGHLIGHT_COUNT = 3;

const modal = useTemplateRef('modal');

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const isBeta = version.includes('-beta') || version.includes('-alpha') || version.includes('-rc');
const release = forkChangelog.find(r => r.version === version) ?? null;
// 弹窗只列本次发布的前几条，完整内容在更新日志页
const highlights = release == null ? [] : release.groups.flatMap(g => g.items.map(i => i.text)).slice(0, HIGHLIGHT_COUNT);

function whatIsNew() {
	modal.value?.close();
	mainRouter.push('/changelog', { query: { version } });
}

onMounted(() => {
	confetti({
		duration: 1000 * 3,
	});
});
</script>

<style lang="scss" module>
.root {
	margin: auto;
	position: relative;
	padding: 32px;
	min-width: 320px;
	max-width: 480px;
	box-sizing: border-box;
	text-align: center;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.title {
	font-weight: bold;
}

.version {
	margin: 1em 0;
	overflow-wrap: anywhere;
}

.beta {
	margin: 1em 0;
}

.highlights {
	margin: 0 0 1.2em;
	padding: 10px 12px 10px 2em;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	text-align: left;
	font-size: 0.88em;
	line-height: 1.6;

	> li + li {
		margin-top: 4px;
	}
}

.gotIt {
	margin: 8px 0 0 0;
}
</style>
