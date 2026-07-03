<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div v-if="token" class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<MkInput v-model="password" type="password">
				<template #prefix><i class="ti ti-lock"></i></template>
				<template #label>{{ i18n.ts.newPassword }}</template>
			</MkInput>

			<MkInput v-model="retypedPassword" type="password">
				<template #prefix><i class="ti ti-lock"></i></template>
				<template #label>{{ i18n.ts.newPassword }} ({{ i18n.ts.retype }})</template>
				<template v-if="passwordRetypeState === 'match'" #caption><span style="color: var(--MI_THEME-success)"><i class="ti ti-check ti-fw"></i> {{ i18n.ts.passwordMatched }}</span></template>
				<template v-else-if="passwordRetypeState === 'not-match'" #caption><span style="color: var(--MI_THEME-error)"><i class="ti ti-alert-triangle ti-fw"></i> {{ i18n.ts.passwordNotMatched }}</span></template>
			</MkInput>

			<MkButton primary :disabled="!canSave" @click="save">{{ i18n.ts.save }}</MkButton>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { mainRouter } from '@/router.js';

const props = defineProps<{
	token?: string;
}>();

const password = ref('');
const retypedPassword = ref('');

const passwordRetypeState = computed(() => {
	if (password.value === '' || retypedPassword.value === '') return null;
	return password.value === retypedPassword.value ? 'match' : 'not-match';
});

const canSave = computed(() => password.value !== '' && passwordRetypeState.value === 'match');

async function save() {
	if (props.token == null || !canSave.value) return;
	await os.apiWithDialog('reset-password', {
		token: props.token,
		password: password.value,
	});
	mainRouter.push('/');
}

onMounted(async () => {
	if (props.token == null) {
		const { dispose } = await os.popupAsyncWithDialog(import('@/components/MkForgotPassword.vue').then(x => x.default), {}, {
			closed: () => dispose(),
		});
		mainRouter.push('/');
	}
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.resetPassword,
	icon: 'ti ti-lock',
}));
</script>
