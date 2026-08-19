<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow ref="dialogEl" :width="560" :height="600" @close="closeDialog" @closed="emit('closed')" @esc="closeDialog">
	<template #header>{{ editing ? i18n.ts._agents.byokEditModel : i18n.ts._agents.byokAddModel }}</template>
	<div :class="$style.body" class="_gaps_s">
		<MkInfo v-if="nameConflict" warn>{{ i18n.ts._agents.byokNameConflict }}</MkInfo>

		<!-- 已选择的提供商（连接信息已预填，可修改） -->
		<div v-if="provider && !editing" :class="$style.providerBanner">
			<i class="ti ti-server-2"></i>
			<span>{{ i18n.tsx._agents.byokProviderBanner({ name: provider.name }) }}</span>
		</div>

		<MkInput v-model="form.name">
			<template #label>{{ i18n.ts._agents.byokFieldName }}</template>
			<template #caption>{{ i18n.ts._agents.byokFieldNameCaption }}</template>
		</MkInput>
		<MkInput v-model="form.baseUrl">
			<template #label>{{ i18n.ts._agents.byokFieldBaseUrl }}</template>
			<template #prefix><i class="ti ti-link"></i></template>
		</MkInput>
		<MkInput v-model="form.apiKey" type="password">
			<template #label>{{ i18n.ts._agents.byokFieldApiKey }}</template>
			<template #caption>{{ editing ? i18n.ts._agents.byokApiKeyKeepHint : i18n.ts._agents.byokApiKeyCaption }}</template>
		</MkInput>
		<MkInput v-model="form.apiModelName">
			<template #label>{{ i18n.ts._agents.byokFieldApiModelName }}</template>
			<template #caption>{{ i18n.ts._agents.byokFieldApiModelNameCaption }}</template>
		</MkInput>
		<FormSplit :minWidth="260">
			<MkInput v-model="form.maxContextTokens" type="text">
				<template #label>{{ i18n.ts._agents.byokFieldContext }}</template>
			</MkInput>
			<MkInput v-model="form.maxOutputTokensPerCall" type="text">
				<template #label>{{ i18n.ts._agents.byokFieldOutput }}</template>
			</MkInput>
		</FormSplit>
		<FormSplit :minWidth="260">
			<MkSelect v-model="form.tokenizerEncoding" :items="tokenizerEncodingItems">
				<template #label>{{ i18n.ts._agents.byokFieldTokenizer }}</template>
				<template #caption>{{ i18n.ts._agents.byokFieldTokenizerCaption }}</template>
			</MkSelect>
			<MkSelect v-model="form.charsPerToken" :items="charsPerTokenItems">
				<template #label>{{ i18n.ts._agents.byokFieldCharsPerToken }}</template>
			</MkSelect>
		</FormSplit>
		<MkInfo v-if="submitError" warn>{{ submitError }}</MkInfo>
	</div>
	<template #footer>
		<div :class="$style.footer">
			<MkButton rounded :disabled="submitting" @click="closeDialog">{{ i18n.ts.cancel }}</MkButton>
			<MkButton primary rounded :disabled="submitting" @click="submit">
				<MkLoading v-if="submitting" :mini="true"/>
				{{ editing ? i18n.ts.save : i18n.ts._agents.byokAddModel }}
			</MkButton>
		</div>
	</template>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, useTemplateRef } from 'vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import FormSplit from '@/components/form/split.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
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

type ModelLike = {
	id: string;
	name: string;
	baseUrl: string;
	apiModelName: string;
	maxContextTokens: number;
	maxOutputTokensPerCall: number;
	tokenizerEncoding: string | null;
	charsPerToken: number | null;
	providerId: string | null;
};

const props = withDefaults(defineProps<{
	provider?: Provider | null;
	model?: ModelLike | null;
	existingNames: string[];
}>(), {
	provider: null,
	model: null,
	existingNames: () => [],
});

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const editing = computed(() => props.model != null);
const provider = computed(() => props.provider ?? null);

const form = reactive({
	name: props.model?.name ?? '',
	baseUrl: props.model?.baseUrl ?? provider.value?.baseUrl ?? '',
	apiKey: '',
	apiModelName: props.model?.apiModelName ?? provider.value?.apiModelName ?? '',
	maxContextTokens: String(props.model?.maxContextTokens ?? provider.value?.maxContextTokens ?? 8192),
	maxOutputTokensPerCall: String(props.model?.maxOutputTokensPerCall ?? provider.value?.maxOutputTokensPerCall ?? 2048),
	tokenizerEncoding: props.model?.tokenizerEncoding ?? provider.value?.tokenizerEncoding ?? '',
	charsPerToken: props.model?.charsPerToken != null
		? String(props.model.charsPerToken)
		: (provider.value?.charsPerToken != null ? String(provider.value.charsPerToken) : ''),
});

const submitting = ref(false);
const submitError = ref('');
const dialogEl = useTemplateRef('dialogEl');

function closeDialog() {
	dialogEl.value?.close();
}

const tokenizerEncodingItems = [
	{ value: '', label: '不使用（字符估算）' },
	{ value: 'cl100k_base', label: 'cl100k_base（GPT-4 / GPT-3.5-turbo）' },
	{ value: 'o200k_base', label: 'o200k_base（GPT-4o / GPT-4o-mini）' },
	{ value: 'p50k_base', label: 'p50k_base（text-davinci-003）' },
	{ value: 'r50k_base', label: 'r50k_base（text-davinci-002）' },
	{ value: 'gpt2', label: 'gpt2（GPT-2）' },
	{ value: 'gemini:gemini-3-pro-preview', label: 'Gemini 3' },
	{ value: 'gemini:gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
	{ value: 'gemini:gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
	{ value: 'gemini:gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
	{ value: 'glm:glm-5.5', label: 'GLM-5.5（智谱，真分词器）' },
	{ value: 'glm:glm-5.2', label: 'GLM-5.2（智谱，真分词器）' },
	{ value: 'glm:glm-4.7', label: 'GLM-4.7（智谱，真分词器）' },
	{ value: 'glm:glm-4.5', label: 'GLM-4.5（智谱，真分词器）' },
	{ value: 'glm:glm-4-plus', label: 'GLM-4 Plus（智谱，真分词器）' },
	{ value: 'glm:glm-4-flash', label: 'GLM-4 Flash（智谱，真分词器）' },
	{ value: 'deepseek:deepseek-v4-pro', label: 'DeepSeek-V4 Pro（真分词器）' },
	{ value: 'deepseek:deepseek-v4-flash', label: 'DeepSeek-V4 Flash（真分词器）' },
	{ value: 'deepseek:deepseek-v3', label: 'DeepSeek-V3（真分词器）' },
	{ value: 'deepseek:deepseek-r1', label: 'DeepSeek-R1（真分词器）' },
	{ value: 'claude:claude-fable-5', label: 'Claude Fable 5（兼容近似）' },
	{ value: 'claude:claude-opus-4-8', label: 'Claude Opus 4.8（兼容近似）' },
	{ value: 'claude:claude-sonnet-4-5', label: 'Claude Sonnet 4.5（兼容近似）' },
];

const charsPerTokenItems = [
	{ value: '', label: '默认（3 字符/token）' },
	{ value: '2', label: '2（英文为主）' },
	{ value: '3', label: '3（中英混合）' },
	{ value: '4', label: '4（中文为主）' },
	{ value: '6', label: '6（代码/日文）' },
];

const nameConflict = computed(() => {
	const t = form.name.trim();
	if (!t) return false;
	return props.existingNames.some(n => n.trim().toLowerCase() === t.toLowerCase());
});

async function submit() {
	submitError.value = '';
	const name = form.name.trim();
	const baseUrl = form.baseUrl.trim();
	const apiKey = form.apiKey.trim();
	const apiModelName = form.apiModelName.trim();
	// 编辑模式留空表示沿用已有 Key：后端仅在请求携带 apiKey 字段时才更新
	const keepExistingKey = editing.value && apiKey === '';
	if (!name || !baseUrl || (!apiKey && !keepExistingKey) || !apiModelName) {
		submitError.value = i18n.ts._agents.byokFormIncomplete;
		return;
	}
	if (nameConflict.value) {
		submitError.value = i18n.ts._agents.byokNameConflict;
		return;
	}
	const payload = {
		name,
		baseUrl,
		apiModelName,
		maxContextTokens: Math.max(256, Math.min(2_000_000, Math.trunc(Number(form.maxContextTokens) || 8192))),
		maxOutputTokensPerCall: Math.max(1, Math.min(128_000, Math.trunc(Number(form.maxOutputTokensPerCall) || 2048))),
		tokenizerEncoding: form.tokenizerEncoding.trim() === '' ? null : form.tokenizerEncoding.trim(),
		charsPerToken: form.charsPerToken.trim() === '' ? null : Math.max(1, Math.min(10, Math.trunc(Number(form.charsPerToken) || 3))),
	};
	submitting.value = true;
	try {
		if (editing.value && props.model) {
			// 编辑时不发送 providerId，避免清空已有的提供商关联；
			// 留空 Key 时省略 apiKey 字段，后端只在收到该字段时才更新
			await misskeyApi('agents/byok/models/update', {
				modelId: props.model.id,
				...payload,
				...(keepExistingKey ? {} : { apiKey }),
			});
		} else {
			await misskeyApi('agents/byok/models/create', { ...payload, apiKey, providerId: provider.value?.id ?? null });
		}
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

.providerBanner {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border-radius: 10px;
	font-size: 0.86em;
	line-height: 1.5;
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, var(--MI_THEME-panel));
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 30%, var(--MI_THEME-divider));
	color: var(--MI_THEME-fg);

	> i {
		flex-shrink: 0;
		color: var(--MI_THEME-accent);
	}
}

.footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
</style>
