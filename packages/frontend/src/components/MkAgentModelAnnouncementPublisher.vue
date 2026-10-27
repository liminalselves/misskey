<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkFolder>
	<template #icon><i class="ti ti-speakerphone"></i></template>
	<template #label>发布模型公告</template>
	<div class="_gaps_m">
		<MkInfo>公告会在用户下次进入智能体对话时显示。发布公告不会保存尚未提交的模型配置。</MkInfo>
		<MkSelect v-model="scope" :items="scopeItems">
			<template #label>公告分类</template>
		</MkSelect>
		<MkInput v-model="title">
			<template #label>标题</template>
		</MkInput>
		<MkTextarea v-model="text">
			<template #label>公告内容</template>
			<template #caption>最多 10000 字，支持 MFM 格式。</template>
		</MkTextarea>
		<MkButton primary rounded :disabled="publishing || !title.trim() || !text.trim()" @click="publish">
			<i class="ti ti-send"></i> {{ publishing ? '正在发布…' : '发布公告' }}
		</MkButton>
	</div>
</MkFolder>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import * as os from '@/os.js';

const props = defineProps<{ kind: 'chat' | 'image' }>();
const scope = ref<'all' | 'chat' | 'image'>(props.kind);
const title = ref('');
const text = ref('');
const publishing = ref(false);
const scopeItems = [
	{ value: 'all', label: '通用公告' },
	{ value: 'chat', label: '对话模型' },
	{ value: 'image', label: '绘图模型' },
];

async function publish() {
	if (publishing.value || !title.value.trim() || !text.value.trim()) return;
	if (title.value.trim().length > 256 || text.value.trim().length > 10000) {
		os.alert({ type: 'error', text: '标题最多 256 字，公告内容最多 10000 字。' });
		return;
	}
	publishing.value = true;
	try {
		await (misskeyApi as unknown as (endpoint: string, data: { scope: string; title: string; text: string }) => Promise<void>)(
			'admin/agents/model-announcements/create', { scope: scope.value, title: title.value.trim(), text: text.value.trim() },
		);
		title.value = '';
		text.value = '';
		os.success();
	} catch (error) {
		os.alert({ type: 'error', text: formatApiError(error) });
	} finally {
		publishing.value = false;
	}
}
</script>
