<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="480" :height="460" @close="closeDialog" @closed="emit('closed')" @esc="closeDialog">
	<template #header>上报模型异常</template>
	<div :class="$style.body" class="_gaps_s">
		<MkSelect v-model="form.modelKey" :items="modelItems">
			<template #label>选择模型</template>
		</MkSelect>
		<MkSelect v-model="form.reasonType" :items="reasonItems">
			<template #label>异常类型</template>
		</MkSelect>
		<template v-if="form.reasonType === 'other'">
			<MkTextarea v-model="form.comment">
				<template #label>问题描述</template>
				<template #caption>请描述遇到的问题（必填，最多 1024 字）</template>
			</MkTextarea>
		</template>
		<MkInfo v-else>预设类型无需填写说明，直接提交即可。</MkInfo>
		<MkInfo v-if="submitError" warn>{{ submitError }}</MkInfo>
	</div>
	<template #footer>
		<div :class="$style.footer">
			<MkButton rounded :disabled="submitting" @click="closeDialog">取消</MkButton>
			<MkButton primary rounded :disabled="submitting || !canSubmit" @click="submit">
				<MkLoading v-if="submitting" :mini="true"/>
				提交上报
			</MkButton>
		</div>
	</template>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import * as os from '@/os.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';

type ModelOption = { id: string; name: string };

const props = withDefaults(defineProps<{
	chatModels?: ModelOption[];
	imageModels?: ModelOption[];
}>(), {
	chatModels: () => [],
	imageModels: () => [],
});

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const form = reactive({
	modelKey: '',
	reasonType: '',
	comment: '',
});

const submitting = ref(false);
const submitError = ref('');
const dialogEl = useTemplateRef('dialogEl');

// value 编码 kind:id，提交时拆开；label 加分区前缀便于区分同名模型
const modelItems = computed(() => [
	...props.chatModels.map(m => ({ value: `chat:${m.id}`, label: `[对话] ${m.name}` })),
	...props.imageModels.map(m => ({ value: `image:${m.id}`, label: `[绘图] ${m.name}` })),
]);

const reasonItems = [
	{ value: 'unavailable', label: '长时间不可用' },
	{ value: 'degraded', label: '降智' },
	{ value: 'slow', label: '响应缓慢' },
	{ value: 'errors', label: '频繁报错' },
	{ value: 'other', label: '其他' },
];

const isOther = computed(() => form.reasonType === 'other');

const canSubmit = computed(() => {
	if (form.modelKey === '' || form.reasonType === '') return false;
	if (isOther.value) return form.comment.trim().length > 0;
	return true;
});

function closeDialog() {
	dialogEl.value?.close();
}

function modelNameOf(modelKey: string): string {
	const kind = modelKey.slice(0, modelKey.indexOf(':'));
	const id = modelKey.slice(modelKey.indexOf(':') + 1);
	const list = kind === 'image' ? props.imageModels : props.chatModels;
	return list.find(m => m.id === id)?.name ?? id;
}

async function submit() {
	submitError.value = '';
	if (!canSubmit.value) return;
	if (isOther.value && form.comment.trim().length > 1024) {
		submitError.value = '问题描述不能超过 1024 字';
		return;
	}
	const separatorIndex = form.modelKey.indexOf(':');
	const payload = {
		modelKind: form.modelKey.slice(0, separatorIndex),
		modelId: form.modelKey.slice(separatorIndex + 1),
		modelName: modelNameOf(form.modelKey),
		reasonType: form.reasonType,
		...(isOther.value ? { comment: form.comment.trim() } : {}),
	};
	submitting.value = true;
	try {
		await misskeyApi('agents/model-reports/create' as Parameters<typeof misskeyApi>[0], payload as any);
		os.toast('已提交上报，感谢反馈');
		closeDialog();
	} catch (e) {
		submitError.value = formatApiError(e);
	} finally {
		submitting.value = false;
	}
}
</script>

<style lang="scss" module>
.body {
	padding: 16px;
}

.footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
</style>
