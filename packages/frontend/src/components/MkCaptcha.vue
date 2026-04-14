<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<span v-if="!available">Loading<MkEllipsis/></span>
	<div v-if="props.provider == 'mcaptcha'">
		<div id="mcaptcha__widget-container" class="m-captcha-style"></div>
		<div ref="captchaEl"></div>
	</div>
	<div v-if="props.provider == 'testcaptcha'" style="background: #eee; border: solid 1px #888; padding: 8px; color: #000; max-width: 320px; display: flex; gap: 10px; align-items: center; box-shadow: 2px 2px 6px #0004; border-radius: 4px;">
		<img src="/client-assets/testcaptcha.png" style="width: 60px; height: 60px; "/>
		<div v-if="testcaptchaPassed">
			<div style="color: green;">Test captcha passed!</div>
		</div>
		<div v-else>
			<div style="font-size: 13px; margin-bottom: 4px;">Type "ai-chan-kawaii" to pass captcha</div>
			<input v-model="testcaptchaInput" data-cy-testcaptcha-input/>
			<button type="button" data-cy-testcaptcha-submit @click="testcaptchaSubmit">Submit</button>
		</div>
	</div>
	<div v-else ref="captchaEl"></div>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, onMounted, onBeforeUnmount, watch, onUnmounted, useCssModule } from 'vue';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';

// APIs provided by Captcha services
// see: https://docs.hcaptcha.com/configuration/#javascript-api
// see: https://developers.google.com/recaptcha/docs/display?hl=ja
// see: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/#explicitly-render-the-turnstile-widget
export type Captcha = {
	render(container: string | Node, options: {
		readonly [_ in 'sitekey' | 'theme' | 'type' | 'size' | 'tabindex' | 'callback' | 'expired' | 'expired-callback' | 'error-callback' | 'endpoint']?: unknown;
	}): string;
	remove(id: string): void;
	execute(id: string): void;
	reset(id?: string): void;
	getResponse(id: string): string;
};

type AliyunCaptcha = {
	show?: () => void;
	hide?: () => void;
	startTracelessVerification?: () => void;
};

export type CaptchaProvider = 'hcaptcha' | 'recaptcha' | 'turnstile' | 'mcaptcha' | 'aliyuncaptcha' | 'testcaptcha';

type CaptchaContainer = {
	readonly [_ in CaptchaProvider]?: Captcha;
};

declare global {
	// Window を拡張してるため、空ではない
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface Window extends CaptchaContainer { }
}

type AliyunCaptchaWindow = Window & {
	AliyunCaptchaConfig?: {
		region: string;
		prefix: string;
	};
	initAliyunCaptcha?: (options: {
		SceneId: string;
		mode: 'popup';
		element: string | HTMLElement;
		button: string | HTMLElement;
		success: (captchaVerifyParam: string) => void;
		fail?: (result: unknown) => void;
		getInstance: (instance: AliyunCaptcha) => void;
	}) => void;
};

const props = defineProps<{
	provider: CaptchaProvider;
	sitekey: string | null; // null will show error on request
	secretKey?: string | null;
	instanceUrl?: string | null;
	sceneId?: string | null;
	region?: string | null;
	modelValue?: string | null;
}>();

const emit = defineEmits<{
	(ev: 'update:modelValue', v: string | null): void;
}>();

const available = ref(false);

const captchaEl = useTemplateRef('captchaEl');
const captchaWidgetId = ref<string | undefined>(undefined);
const aliyunCaptchaInstance = ref<AliyunCaptcha | undefined>(undefined);
const testcaptchaInput = ref('');
const testcaptchaPassed = ref(false);
const styleModule = useCssModule();

const variable = computed(() => {
	switch (props.provider) {
		case 'hcaptcha': return 'hcaptcha';
		case 'recaptcha': return 'grecaptcha';
		case 'turnstile': return 'turnstile';
		case 'mcaptcha': return 'mcaptcha';
		case 'aliyuncaptcha': return 'initAliyunCaptcha';
		case 'testcaptcha': return 'testcaptcha';
	}
});

const loaded = !!(window as any)[variable.value];

const src = computed(() => {
	switch (props.provider) {
		case 'hcaptcha': return 'https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off';
		case 'recaptcha': return 'https://www.recaptcha.net/recaptcha/api.js?render=explicit';
		case 'turnstile': return 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
		case 'aliyuncaptcha': return 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js';
		case 'mcaptcha': return null;
		case 'testcaptcha': return null;
	}
});

const scriptId = computed(() => `script-${props.provider}`);

const captcha = computed<Captcha>(() => (window as any)[variable.value] ?? {} as unknown as Captcha);

watch(() => [props.instanceUrl, props.sitekey, props.secretKey, props.sceneId, props.region], async () => {
	// 変更があったときはリフレッシュと再レンダリングをしておかないと、変更後の値で再検証が出来ない
	if (available.value) {
		callback(undefined);
		clearWidget();
		await requestRender();
	}
});

if (loaded || props.provider === 'mcaptcha' || props.provider === 'testcaptcha') {
	available.value = true;
} else if (src.value !== null) {
	(window.document.getElementById(scriptId.value) ?? window.document.head.appendChild(Object.assign(window.document.createElement('script'), {
		async: true,
		id: scriptId.value,
		src: src.value,
	})))
		.addEventListener('load', () => available.value = true);
}

function reset() {
	if (props.provider === 'aliyuncaptcha') {
		callback(undefined);
		return;
	}

	if (captcha.value.reset && captchaWidgetId.value !== undefined) {
		try {
			captcha.value.reset(captchaWidgetId.value);
		} catch (error: unknown) {
			// ignore
			if (_DEV_) console.warn(error);
		}
	}
	testcaptchaPassed.value = false;
	testcaptchaInput.value = '';
}

function remove() {
	if (captcha.value.remove && captchaWidgetId.value) {
		try {
			if (_DEV_) console.log('remove', props.provider, captchaWidgetId.value);
			captcha.value.remove(captchaWidgetId.value);
		} catch (error: unknown) {
			// ignore
			if (_DEV_) console.warn(error);
		}
	}
}

async function requestRender() {
	if (props.provider === 'aliyuncaptcha') {
		if (captchaEl.value instanceof Element && props.sitekey && props.sceneId && (window as AliyunCaptchaWindow).initAliyunCaptcha) {
			const root = window.document.createElement('div');
			const trigger = window.document.createElement('button');
			const uniq = Math.random().toString(36).slice(2);
			root.id = `aliyun-captcha-element-${uniq}`;
			trigger.id = `aliyun-captcha-button-${uniq}`;
			trigger.type = 'button';
			trigger.textContent = i18n.ts._captcha.verify ?? '验证';
			trigger.className = styleModule.aliyunTrigger;
			captchaEl.value.appendChild(root);
			captchaEl.value.appendChild(trigger);

			(window as AliyunCaptchaWindow).AliyunCaptchaConfig = {
				region: props.region ?? 'cn',
				prefix: props.sitekey,
			};
			(window as AliyunCaptchaWindow).initAliyunCaptcha?.({
				SceneId: props.sceneId,
				mode: 'popup',
				element: root,
				button: trigger,
				success: (captchaVerifyParam: string) => callback(captchaVerifyParam),
				fail: (result: unknown) => {
					callback(undefined);
					if (_DEV_) console.warn('aliyun captcha failed', result);
				},
				getInstance: (instance: AliyunCaptcha) => {
					aliyunCaptchaInstance.value = instance;
				},
			});

			// Fallback: some builds don't bind click properly; ensure click triggers popup.
			trigger.addEventListener('click', () => {
				aliyunCaptchaInstance.value?.startTracelessVerification?.();
				aliyunCaptchaInstance.value?.show?.();
			});
			return;
		}
		window.setTimeout(requestRender, 1);
		return;
	}

	if (captcha.value.render && captchaEl.value instanceof Element && props.sitekey) {
		// reCAPTCHAのレンダリング重複判定を回避するため、captchaEl配下に仮のdivを用意する.
		// （同じdivに対して複数回renderを呼び出すとreCAPTCHAはエラーを返すので）
		const elem = window.document.createElement('div');
		captchaEl.value.appendChild(elem);

		captchaWidgetId.value = captcha.value.render(elem, {
			sitekey: props.sitekey,
			theme: store.s.darkMode ? 'dark' : 'light',
			callback: callback,
			'expired-callback': () => callback(undefined),
			'error-callback': () => callback(undefined),
		});
	} else if (props.provider === 'mcaptcha' && props.instanceUrl && props.sitekey) {
		const { default: Widget } = await import('@mcaptcha/vanilla-glue');
		new Widget({
			siteKey: {
				instanceUrl: new URL(props.instanceUrl),
				key: props.sitekey,
			},
		});
	} else {
		window.setTimeout(requestRender, 1);
	}
}

function clearWidget() {
	if (props.provider === 'mcaptcha') {
		const container = window.document.getElementById('mcaptcha__widget-container');
		if (container) {
			container.innerHTML = '';
		}
	} else {
		aliyunCaptchaInstance.value = undefined;
		reset();
		remove();

		if (captchaEl.value) {
			// レンダリング先のコンテナの中身を掃除し、フォームが増殖するのを抑止
			captchaEl.value.innerHTML = '';
		}
	}
}

function callback(response?: string) {
	emit('update:modelValue', typeof response === 'string' ? response : null);
}

function onReceivedMessage(message: MessageEvent) {
	if (message.data.token) {
		if (props.instanceUrl && new URL(message.origin).host === new URL(props.instanceUrl).host) {
			callback(message.data.token);
		}
	}
}

function testcaptchaSubmit() {
	testcaptchaPassed.value = testcaptchaInput.value === 'ai-chan-kawaii';
	callback(testcaptchaPassed.value ? 'testcaptcha-passed' : undefined);
	if (!testcaptchaPassed.value) testcaptchaInput.value = '';
}

onMounted(() => {
	if (available.value) {
		window.addEventListener('message', onReceivedMessage);
		requestRender();
	} else {
		watch(available, requestRender);
	}
});

onUnmounted(() => {
	window.removeEventListener('message', onReceivedMessage);
});

onBeforeUnmount(() => {
	clearWidget();
});

defineExpose({
	reset,
});

</script>

<style lang="scss" module>
.aliyunTrigger {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 100px;
	height: 40px;
	padding: 0 16px;
	border-radius: 999px;
	border: none;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 100%;
	font-weight: 700;
	line-height: 1;
	cursor: pointer;
	transition: background 0.1s ease, transform 0.1s ease;
	user-select: none;
}

.aliyunTrigger:hover {
	background: hsl(from var(--MI_THEME-accent) h s calc(l + 5));
}

.aliyunTrigger:active {
	background: hsl(from var(--MI_THEME-accent) h s calc(l + 5));
}

.aliyunTrigger:focus-visible {
	outline: 2px solid color-mix(in srgb, var(--MI_THEME-accent) 45%, transparent);
	outline-offset: 2px;
}
</style>
