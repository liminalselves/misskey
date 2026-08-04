<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.widget">
		<div v-if="!available" :class="$style.loading">
			<i class="ti ti-loader-2" aria-hidden="true"></i>
			<span>{{ i18n.ts.loading }}<MkEllipsis/></span>
		</div>
		<template v-else-if="props.provider === 'mcaptcha'">
			<div id="mcaptcha__widget-container" class="m-captcha-style"></div>
			<div ref="captchaEl" :class="$style.externalWidget"></div>
		</template>
		<div v-else-if="props.provider === 'testcaptcha'" :class="$style.testCaptcha">
			<img src="/client-assets/testcaptcha.png" :class="$style.testCaptchaImage" alt=""/>
			<div :class="$style.testCaptchaBody">
				<div v-if="testcaptchaPassed" :class="$style.testCaptchaPassed">
					<i class="ti ti-check" aria-hidden="true"></i>
					Test captcha passed
				</div>
				<template v-else>
					<label :class="$style.testCaptchaLabel" for="testcaptcha-input">Type "ai-chan-kawaii" to pass captcha</label>
					<div :class="$style.testCaptchaControls">
						<input id="testcaptcha-input" v-model="testcaptchaInput" :class="$style.testCaptchaInput" data-cy-testcaptcha-input @keydown.enter.prevent="testcaptchaSubmit"/>
						<button type="button" :class="$style.testCaptchaSubmit" data-cy-testcaptcha-submit @click="testcaptchaSubmit">
							<i class="ti ti-arrow-right" aria-hidden="true"></i>
						</button>
					</div>
				</template>
			</div>
		</div>
		<div v-else ref="captchaEl" :class="$style.externalWidget"></div>
	</div>
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
const aliyunTriggerEl = ref<HTMLButtonElement | undefined>(undefined);
const aliyunTriggerIconEl = ref<HTMLElement | undefined>(undefined);
const aliyunTriggerLabelEl = ref<HTMLSpanElement | undefined>(undefined);
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
	return '';
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
	return null;
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
	// 阿里云验证码要求 AliyunCaptchaConfig 必须在主脚本加载前设置
	if (props.provider === 'aliyuncaptcha' && props.sitekey) {
		(window as AliyunCaptchaWindow).AliyunCaptchaConfig = {
			region: props.region ?? 'cn',
			prefix: props.sitekey,
		};
	}
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
			const triggerIcon = window.document.createElement('i');
			const triggerLabel = window.document.createElement('span');
			const uniq = Math.random().toString(36).slice(2);
			root.id = `aliyun-captcha-element-${uniq}`;
			root.className = styleModule.aliyunHost;
			trigger.id = `aliyun-captcha-button-${uniq}`;
			trigger.type = 'button';
			trigger.className = styleModule.aliyunTrigger;
			triggerIcon.setAttribute('aria-hidden', 'true');
			trigger.append(triggerIcon, triggerLabel);
			aliyunTriggerEl.value = trigger;
			aliyunTriggerIconEl.value = triggerIcon;
			aliyunTriggerLabelEl.value = triggerLabel;
			updateAliyunTriggerState(false);
			captchaEl.value.appendChild(root);
			captchaEl.value.appendChild(trigger);

			(window as AliyunCaptchaWindow).AliyunCaptchaConfig = {
				region: props.region ?? 'cn',
				prefix: props.sitekey,
			};

			let gotInstance = false;
			const initOptions = {
				SceneId: props.sceneId,
				mode: 'popup' as const,
				element: root,
				button: trigger,
				success: (captchaVerifyParam: string) => callback(captchaVerifyParam),
				fail: (result: unknown) => {
					callback(undefined);
					if (_DEV_) console.warn('aliyun captcha failed', result);
				},
				getInstance: (instance: AliyunCaptcha) => {
					gotInstance = true;
					aliyunCaptchaInstance.value = instance;
				},
			};

			try {
				(window as AliyunCaptchaWindow).initAliyunCaptcha?.(initOptions);
			} catch (error: unknown) {
				if (_DEV_) console.warn('initAliyunCaptcha failed', error);
			}

			// 阿里云 SDK 不支持随意重复初始化，若本次未成功渲染出原生组件，
			// 则退避重试，避免出现只剩自绘触发按钮的“旧版”UI
			let retryCount = 0;
			const ensureWidgetRendered = () => {
				window.setTimeout(() => {
					if (!root.isConnected || root.childElementCount > 0 || gotInstance) return;
					if (retryCount++ >= 8) return;
					try {
						(window as AliyunCaptchaWindow).initAliyunCaptcha?.(initOptions);
					} catch (error: unknown) {
						if (_DEV_) console.warn('initAliyunCaptcha retry failed', error);
					}
					ensureWidgetRendered();
				}, 600);
			};
			ensureWidgetRendered();

			// Fallback: some builds don't bind click properly; ensure click triggers popup.
			trigger.addEventListener('click', () => {
				aliyunCaptchaInstance.value?.startTracelessVerification?.();
				aliyunCaptchaInstance.value?.show?.();
			});
			return;
		}
		window.setTimeout(requestRender, 50);
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
		aliyunTriggerEl.value = undefined;
		aliyunTriggerIconEl.value = undefined;
		aliyunTriggerLabelEl.value = undefined;
		reset();
		remove();

		if (captchaEl.value) {
			// レンダリング先のコンテナの中身を掃除し、フォームが増殖するのを抑止
			captchaEl.value.innerHTML = '';
		}
	}
}

function callback(response?: string) {
	updateAliyunTriggerState(typeof response === 'string' && response.length > 0);
	emit('update:modelValue', typeof response === 'string' ? response : null);
}

function updateAliyunTriggerState(verified: boolean) {
	const trigger = aliyunTriggerEl.value;
	const icon = aliyunTriggerIconEl.value;
	const label = aliyunTriggerLabelEl.value;
	if (trigger == null || icon == null || label == null) return;

	trigger.classList.toggle(styleModule.aliyunTriggerVerified, verified);
	trigger.disabled = verified;
	trigger.setAttribute('aria-label', verified ? i18n.ts.done : i18n.ts._captcha.verify);
	icon.className = verified ? 'ti ti-circle-check' : 'ti ti-shield-check';
	label.textContent = verified ? i18n.ts.done : i18n.ts._captcha.verify;
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
.root {
	width: 100%;
	max-width: 360px;
	margin-inline: auto;
	overflow-x: auto;
}

.widget {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 40px;
}

.loading {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;

	> i {
		color: var(--MI_THEME-accent);
		animation: captcha-spin 1s linear infinite;
	}
}

.externalWidget {
	display: flex;
	flex-direction: column;
	gap: 8px;
	width: 100%;
	align-items: center;
	justify-content: center;

	:global(iframe) {
		max-width: 100%;
	}
}

.aliyunHost {
	display: flex;
	flex-direction: column;
	align-items: center;
	width: 100%;

	> :global(*) {
		margin-inline: auto;
		max-width: 100%;
	}
}

.aliyunTrigger {
	display: flex;
	width: 100%;
	align-items: center;
	justify-content: center;
	gap: 7px;
	min-height: 40px;
	padding: 7px 12px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 42%, var(--MI_THEME-divider));
	border-radius: 8px;
	background: color-mix(in srgb, var(--MI_THEME-accentedBg) 72%, var(--MI_THEME-panel));
	color: var(--MI_THEME-fg);
	font: inherit;
	font-size: 0.9em;
	font-weight: 600;
	line-height: 1.2;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
	user-select: none;
}

.aliyunTrigger:hover {
	border-color: var(--MI_THEME-accent);
	background: var(--MI_THEME-accentedBg);
}

.aliyunTrigger:focus-visible {
	outline: 2px solid color-mix(in srgb, var(--MI_THEME-accent) 45%, transparent);
	outline-offset: 2px;
}

.aliyunTriggerVerified,
.aliyunTrigger:disabled {
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 45%, var(--MI_THEME-divider));
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	cursor: default;
}

.testCaptcha {
	display: flex;
	width: 100%;
	align-items: center;
	gap: 12px;
}

.testCaptchaImage {
	flex: 0 0 42px;
	width: 42px;
	height: 42px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 8px;
	object-fit: cover;
}

.testCaptchaBody {
	display: flex;
	flex: 1;
	min-width: 0;
	flex-direction: column;
	gap: 7px;
}

.testCaptchaLabel {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.78em;
	line-height: 1.35;
}

.testCaptchaControls {
	display: flex;
	gap: 6px;
}

.testCaptchaInput {
	width: 100%;
	min-width: 0;
	height: 36px;
	padding: 0 10px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
	outline: none;
	background: var(--MI_THEME-bg);
	color: var(--MI_THEME-fg);
	font: inherit;

	&:focus {
		border-color: var(--MI_THEME-accent);
	}
}

.testCaptchaSubmit {
	display: grid;
	flex: 0 0 36px;
	width: 36px;
	height: 36px;
	place-items: center;
	border: 0;
	border-radius: 6px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	cursor: pointer;
}

.testCaptchaPassed {
	display: flex;
	align-items: center;
	gap: 7px;
	color: var(--MI_THEME-accent);
	font-weight: 700;
}

@keyframes captcha-spin {
	to {
		transform: rotate(360deg);
	}
}

</style>
