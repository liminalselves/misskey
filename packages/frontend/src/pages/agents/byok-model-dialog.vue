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
};

type ModelLike = {
	id: string;
	name: string;
	baseUrl: string;
	apiModelName: string;
	maxContextTokens: number;
	maxOutputTokensPerCall: number;
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
});

const submitting = ref(false);
const submitError = ref('');
const dialogEl = useTemplateRef('dialogEl');

function closeDialog() {
	dialogEl.value?.close();
}

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
