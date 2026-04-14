<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader show-back narrow-merged-row>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<MkLoading v-if="loading"/>
		<div v-else class="_gaps_m">
			<div v-if="form.modified.value" :class="$style.stickySave">
				<MkFormFooter :form="form"/>
			</div>
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-message-cog"></i></template>
				<template #label>{{ i18n.ts._agents.editStyle }}</template>
				<div class="_gaps">
					<MkInput v-model="form.state.name">
						<template #label>{{ i18n.ts._agents.fieldStyleName }}</template>
					</MkInput>
					<MkTextarea v-model="form.state.summary">
						<template #label>{{ i18n.ts._agents.fieldStyleSummary }}</template>
						<template #caption>{{ i18n.ts._agents.fieldStyleSummaryCaption }}</template>
					</MkTextarea>
					<MkTextarea v-model="form.state.body" tall>
						<template #label>{{ i18n.ts._agents.fieldStyleBody }}</template>
					</MkTextarea>
					<MkInfo>{{ i18n.ts._agents.styleBodyHint }}</MkInfo>
				</div>
			</MkFolder>
			<div class="_buttons">
				<MkButton danger rounded @click="remove"><i class="ti ti-trash"></i> {{ i18n.ts._agents.deleteStyle }}</MkButton>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import MkInfo from '@/components/MkInfo.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useForm } from '@/composables/use-form.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';

const props = defineProps<{
	styleId: string;
}>();

const router = useRouter();
const loading = ref(true);

const form = useForm({ name: '', summary: '', body: '' }, async (state) => {
	await misskeyApi('agents/styles/update', {
		styleId: props.styleId,
		name: state.name,
		summary: state.summary.trim() === '' ? null : state.summary,
		body: state.body,
	});
});

async function load() {
	loading.value = true;
	try {
		const row = await misskeyApi('agents/styles/show', { styleId: props.styleId });
		const next = { name: row.name, summary: row.summary ?? '', body: row.body ?? '' };
		Object.assign(form.state, next);
		Object.assign(form.savedState, JSON.parse(JSON.stringify(next)));
	} catch {
		os.alert({ type: 'error', text: i18n.ts.somethingHappened });
		router.push('/agents');
	} finally {
		loading.value = false;
	}
}

onMounted(() => {
	void load();
});

definePage(computed(() => ({
	title: form.state.name.trim() || i18n.ts._agents.editStyle,
	icon: 'ti ti-message-cog',
})));

async function remove() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._agents.deleteStyleConfirm,
	});
	if (canceled) return;
	await misskeyApi('agents/styles/delete', { styleId: props.styleId });
	os.toast(i18n.ts._agents.deleteDone);
	router.push('/agents');
}
</script>

<style lang="scss" module>
.stickySave {
	position: sticky;
	top: 0;
	z-index: 1;
	padding-bottom: 8px;
	background: var(--MI_THEME-bg);
}
</style>
