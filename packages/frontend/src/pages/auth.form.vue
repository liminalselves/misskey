<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<section>
	<div v-if="permissions.length > 0">
		<p>{{ i18n.tsx._auth.permission({ name }) }}</p>
		<ul>
			<li v-for="p in permissions" :key="p">{{ i18n.ts._permissions[p] ?? p }}</li>
		</ul>
	</div>
	<div>{{ i18n.tsx._auth.shareAccess({ name: `${name} (${app.id})` }) }}</div>
	<div :class="$style.buttons">
		<MkButton inline :disabled="waiting" @click="cancel">{{ i18n.ts.cancel }}</MkButton>
		<MkButton inline primary :disabled="waiting" @click="accept">{{ waiting ? i18n.ts.processing : i18n.ts.accept }}</MkButton>
	</div>
</section>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	session: Misskey.entities.AuthSessionShowResponse;
}>();

const emit = defineEmits<{
	(event: 'accepted'): void;
	(event: 'denied'): void;
}>();

const app = computed(() => props.session.app);

const permissions = computed(() => {
	return props.session.app.permission.filter((p): p is typeof Misskey.permissions[number] => typeof p === 'string');
});

const name = computed(() => {
	const el = window.document.createElement('div');
	el.textContent = app.value.name;
	return el.innerHTML;
});

const waiting = ref(false);

function cancel() {
	if (waiting.value) return;
	waiting.value = true;

	// 后端无 auth/deny 端点（上游已移除），直接关闭授权会话即可
	emit('denied');
}

function accept() {
	if (waiting.value) return;
	waiting.value = true;

	misskeyApi('auth/accept', {
		token: props.session.token,
	}).then(() => {
		emit('accepted');
	}).catch(err => {
		waiting.value = false;
		os.alert({
			type: 'error',
			text: err.message + '\n' + err.id,
		});
	});
}
</script>

<style lang="scss" module>
.buttons {
	margin-top: 16px;
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
</style>
