<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialog"
	:width="370"
	:height="520"
	@close="dialog?.close()"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts.forgotPassword }}</template>

	<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
		<form v-if="instance.enableEmail" @submit.prevent="onSubmit">
			<div class="_gaps_m">
				<MkInput v-model="username" type="text" pattern="^[a-zA-Z0-9_]+$" :spellcheck="false" autofocus required>
					<template #label>{{ i18n.ts.username }}</template>
					<template #prefix>@</template>
				</MkInput>

				<MkInput v-model="email" type="email" :spellcheck="false" required>
					<template #label>{{ i18n.ts.emailAddress }}</template>
					<template #caption>{{ i18n.ts._forgotPassword.enterEmail }}</template>
				</MkInput>

				<MkCaptcha v-if="instance.enableHcaptcha" ref="hcaptcha" v-model="hCaptchaResponse" provider="hcaptcha" :sitekey="instance.hcaptchaSiteKey"/>
				<MkCaptcha v-if="instance.enableMcaptcha" ref="mcaptcha" v-model="mCaptchaResponse" provider="mcaptcha" :sitekey="instance.mcaptchaSiteKey" :instanceUrl="instance.mcaptchaInstanceUrl"/>
				<MkCaptcha v-if="instance.enableRecaptcha" ref="recaptcha" v-model="reCaptchaResponse" provider="recaptcha" :sitekey="instance.recaptchaSiteKey"/>
				<MkCaptcha v-if="instance.enableTurnstile" ref="turnstile" v-model="turnstileResponse" provider="turnstile" :sitekey="instance.turnstileSiteKey"/>
				<MkCaptcha v-if="instance.enableAliyunCaptcha" ref="aliyuncaptcha" v-model="aliyunCaptchaResponse" provider="aliyuncaptcha" :sitekey="instance.aliyunCaptchaPrefix" :sceneId="instance.aliyunCaptchaSceneId" :region="instance.aliyunCaptchaRegion || 'cn'"/>
				<MkCaptcha v-if="instance.enableTestcaptcha" ref="testcaptcha" v-model="testcaptchaResponse" provider="testcaptcha" :sitekey="null"/>

				<MkButton type="submit" rounded :disabled="shouldDisableSubmitting" primary style="margin: 0 auto;">{{ i18n.ts.send }}</MkButton>

				<MkInfo>{{ i18n.ts._forgotPassword.ifNoEmail }}</MkInfo>
			</div>
		</form>
		<div v-else>
			{{ i18n.ts._forgotPassword.contactAdmin }}
		</div>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import type { Captcha } from '@/components/MkCaptcha.vue';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkCaptcha from '@/components/MkCaptcha.vue';
import * as os from '@/os.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';

const emit = defineEmits<{
	(ev: 'done'): void;
	(ev: 'closed'): void;
}>();

const dialog = useTemplateRef('dialog');

const username = ref('');
const email = ref('');
const processing = ref(false);
const hcaptcha = ref<Captcha | undefined>();
const mcaptcha = ref<Captcha | undefined>();
const recaptcha = ref<Captcha | undefined>();
const turnstile = ref<Captcha | undefined>();
const aliyuncaptcha = ref<Captcha | undefined>();
const testcaptcha = ref<Captcha | undefined>();
const hCaptchaResponse = ref<string | null>(null);
const mCaptchaResponse = ref<string | null>(null);
const reCaptchaResponse = ref<string | null>(null);
const turnstileResponse = ref<string | null>(null);
const aliyunCaptchaResponse = ref<string | null>(null);
const testcaptchaResponse = ref<string | null>(null);

const shouldDisableSubmitting = computed((): boolean => {
	return processing.value ||
		instance.enableHcaptcha && !hCaptchaResponse.value ||
		instance.enableMcaptcha && !mCaptchaResponse.value ||
		instance.enableRecaptcha && !reCaptchaResponse.value ||
		instance.enableTurnstile && !turnstileResponse.value ||
		instance.enableAliyunCaptcha && !aliyunCaptchaResponse.value ||
		instance.enableTestcaptcha && !testcaptchaResponse.value;
});

async function onSubmit() {
	if (shouldDisableSubmitting.value) return;
	processing.value = true;
	try {
		await os.apiWithDialog('request-reset-password', {
			username: username.value,
			email: email.value,
			'hcaptcha-response': hCaptchaResponse.value,
			'm-captcha-response': mCaptchaResponse.value,
			'g-recaptcha-response': reCaptchaResponse.value,
			'turnstile-response': turnstileResponse.value,
			'aliyun-captcha-response': aliyunCaptchaResponse.value,
			'testcaptcha-response': testcaptchaResponse.value,
		} as any);
		await os.alert({
			type: 'info',
			title: i18n.ts.done,
			text: i18n.ts._forgotPassword.enterEmail,
		});
		emit('done');
		dialog.value?.close();
	} catch (err) {
		hcaptcha.value?.reset?.();
		mcaptcha.value?.reset?.();
		recaptcha.value?.reset?.();
		turnstile.value?.reset?.();
		aliyuncaptcha.value?.reset?.();
		testcaptcha.value?.reset?.();
		throw err;
	} finally {
		processing.value = false;
	}
}
</script>
