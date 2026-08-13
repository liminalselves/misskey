<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="form.modified.value" :class="$style.root">
	<div :class="$style.text">{{ i18n.tsx.thereAreNChanges({ n: form.modifiedCount.value }) }}</div>
	<div style="margin-left: auto;" class="_buttons">
		<MkButton danger rounded @click="form.discard"><i class="ti ti-x"></i> {{ i18n.ts.discard }}</MkButton>
		<MkButton primary rounded :disabled="!canSaving || saving" @click="save"><i class="ti ti-check"></i> {{ saving ? i18n.ts.saving : i18n.ts.save }}</MkButton>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import MkButton from './MkButton.vue';
import type { useForm } from '@/composables/use-form.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	form: ReturnType<typeof useForm>;
	canSaving?: boolean;
}>(), {
	canSaving: true,
});

const saving = ref(false);

async function save(): Promise<void> {
	if (saving.value) return;
	saving.value = true;
	try {
		// 失败时错误提示由 save 回调/调用方负责（如 os.apiWithDialog 或具体校验 alert），
		// 此处不再弹通用错误，避免双重弹窗；_save 失败会保持 modified 状态以便重试
		await props.form.save();
	} finally {
		saving.value = false;
	}
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	align-items: center;
}

.text {
	color: var(--MI_THEME-warn);
	font-size: 90%;
	animation: modified-blink 2s infinite;
}

@keyframes modified-blink {
	0% { opacity: 1; }
	50% { opacity: 0.5; }
	100% { opacity: 1; }
}
</style>
