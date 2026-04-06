<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkButton
	v-if="supported && !pushRegistrationInServer"
	type="button"
	primary
	:gradate="gradate"
	:rounded="rounded"
	:inline="inline"
	:autofocus="autofocus"
	:wait="wait"
	:full="full"
	@click="subscribe"
>
	{{ subscribeLabel }}
</MkButton>
<MkButton
	v-else-if="!showOnlyToRegister && ($i ? pushRegistrationInServer : pushSubscription)"
	type="button"
	:primary="false"
	:gradate="gradate"
	:rounded="rounded"
	:inline="inline"
	:autofocus="autofocus"
	:wait="wait"
	:full="full"
	@click="unsubscribe"
>
	{{ unsubscribeLabel }}
</MkButton>
<MkButton v-else-if="$i && pushRegistrationInServer" disabled :rounded="rounded" :inline="inline" :wait="wait" :full="full">
	{{ i18n.ts.pushNotificationAlreadySubscribed }}
</MkButton>
<MkButton v-else-if="!supported" disabled :rounded="rounded" :inline="inline" :wait="wait" :full="full">
	{{ i18n.ts.pushNotificationNotSupported }}
</MkButton>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { instanceName } from '@@/js/config.js';
import { isEmbeddedAppShell } from '@/utility/is-embedded-app-shell.js';
import { $i } from '@/i.js';
import MkButton from '@/components/MkButton.vue';
import { instance } from '@/instance.js';
import { apiWithDialog, promiseDialog, alert } from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { getAccounts } from '@/accounts.js';

/** Flutter WebView：`addJavaScriptChannel('AppNativePush')`，与壳工程约定一致 */
const LIMINAL_NATIVE_PUSH_EVENT = 'liminal-native-push';
const LIMINAL_APP_NATIVE_PUSH_ENDPOINT = 'liminal:app-native-push';

defineProps<{
	primary?: boolean;
	gradate?: boolean;
	rounded?: boolean;
	inline?: boolean;
	link?: boolean;
	to?: string;
	autofocus?: boolean;
	wait?: boolean;
	danger?: boolean;
	full?: boolean;
	showOnlyToRegister?: boolean;
}>();

// ServiceWorker registration
const registration = ref<ServiceWorkerRegistration | undefined>();
// If this browser supports push notification
const supported = ref(false);
// If this browser has already subscribed to push notification
const pushSubscription = ref<PushSubscription | null>(null);
const pushRegistrationInServer = ref<{ state?: string; key?: string; userId: string; endpoint: string; sendReadMessage: boolean; } | undefined>();

const subscribeLabel = computed(() =>
	isEmbeddedAppShell() ? i18n.ts.subscribePushNotificationApp : i18n.ts.subscribePushNotificationBrowser,
);
const unsubscribeLabel = computed(() =>
	isEmbeddedAppShell() ? i18n.ts.unsubscribePushNotificationApp : i18n.ts.unsubscribePushNotificationBrowser,
);

function postAppNativePush(action: 'enable' | 'disable' | 'query') {
	try {
		const bridge = (window as unknown as { AppNativePush?: { postMessage: (msg: string) => void } }).AppNativePush;
		bridge?.postMessage?.(action);
	} catch {
		// 非 App WebView
	}
}

function onLiminalNativePush(ev: Event) {
	const d = (ev as CustomEvent<{ registered?: boolean }>).detail;
	if (d?.registered === true) {
		pushRegistrationInServer.value = {
			userId: $i?.id ?? '',
			endpoint: LIMINAL_APP_NATIVE_PUSH_ENDPOINT,
			sendReadMessage: false,
		};
	} else {
		pushRegistrationInServer.value = undefined;
	}
}

onMounted(() => {
	if (isEmbeddedAppShell()) {
		window.addEventListener(LIMINAL_NATIVE_PUSH_EVENT, onLiminalNativePush);
		postAppNativePush('query');
	}
});

onUnmounted(() => {
	if (isEmbeddedAppShell()) {
		window.removeEventListener(LIMINAL_NATIVE_PUSH_EVENT, onLiminalNativePush);
	}
});

watch(
	() => $i?.token,
	() => {
		if (isEmbeddedAppShell()) {
			supported.value = $i != null && $i.token != null;
		}
	},
	{ immediate: true },
);

async function syncPushRegistrationState() {
	if (isEmbeddedAppShell()) {
		supported.value = $i != null && $i.token != null;
		return;
	}
	if (!registration.value) return;

	const canPush =
		instance.swPublickey != null
		&& instance.enableServiceWorker !== false
		&& ('PushManager' in window)
		&& $i != null
		&& $i.token != null;

	supported.value = canPush;

	if (canPush && pushSubscription.value) {
		const res = await misskeyApi('sw/show-registration', {
			endpoint: pushSubscription.value.endpoint,
		});

		if (res) {
			pushRegistrationInServer.value = res;
		}
	}
}

async function subscribe() {
	if (isEmbeddedAppShell()) {
		postAppNativePush('enable');
		return;
	}

	if (!registration.value || !supported.value || !instance.swPublickey) return;

	if ('Notification' in window) {
		let permission = Notification.permission;

		if (Notification.permission === 'default') {
			permission = await promiseDialog(Notification.requestPermission(), null, null, i18n.ts.pleaseAllowPushNotification);
		}

		if (permission !== 'granted') {
			alert({
				type: 'error',
				title: i18n.ts.browserPushNotificationDisabled,
				text: i18n.tsx.browserPushNotificationDisabledDescription({ serverName: instanceName }),
			});
			return;
		}
	}

	// SEE: https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe#Parameters
	await promiseDialog(registration.value.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(instance.swPublickey),
	})
		.then(async subscription => {
			pushSubscription.value = subscription;

			// Register
			pushRegistrationInServer.value = await misskeyApi('sw/register', {
				endpoint: subscription.endpoint,
				auth: encode(subscription.getKey('auth')),
				publickey: encode(subscription.getKey('p256dh')),
			});
		}, async err => { // When subscribe failed
			// 通知が許可されていなかったとき
			if (err?.name === 'NotAllowedError') {
				console.info('User denied the notification permission request.');
				return;
			}

			// 違うapplicationServerKey (または gcm_sender_id)のサブスクリプションが
			// 既に存在していることが原因でエラーになった可能性があるので、
			// そのサブスクリプションを解除しておく
			// （これは実行されなさそうだけど、おまじない的に古い実装から残してある）
			await unsubscribe();
		}), null, null);
}

async function unsubscribe() {
	if (isEmbeddedAppShell()) {
		postAppNativePush('disable');
		return;
	}

	if (!pushSubscription.value) return;

	const endpoint = pushSubscription.value.endpoint;
	const accounts = await getAccounts();

	pushRegistrationInServer.value = undefined;

	if ($i && accounts.length >= 2) {
		apiWithDialog('sw/unregister', {
			endpoint,
		}, $i.token);
	} else {
		pushSubscription.value.unsubscribe();
		apiWithDialog('sw/unregister', {
			endpoint,
		}, null);
		pushSubscription.value = null;
	}
}

function encode(buffer: ArrayBuffer | null) {
	return btoa(String.fromCharCode(...(buffer != null ? new Uint8Array(buffer) : [])));
}

/**
 * Convert the URL safe base64 string to a Uint8Array
 * @param base64String base64 string
 */
function urlBase64ToUint8Array(base64String: string): BufferSource {
	const padding = '='.repeat((4 - base64String.length % 4) % 4);
	const base64 = (base64String + padding)
		.replace(/-/g, '+')
		.replace(/_/g, '/');

	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);

	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}

if (navigator.serviceWorker == null) {
	// 埋め込みシェルなど SW が無い環境
	if (isEmbeddedAppShell()) {
		supported.value = $i != null && $i.token != null;
	}
} else {
	void navigator.serviceWorker.ready.then(async swr => {
		registration.value = swr;

		if (isEmbeddedAppShell()) {
			supported.value = $i != null && $i.token != null;
			return;
		}

		pushSubscription.value = await registration.value.pushManager.getSubscription();

		await syncPushRegistrationState();

		// instance（swPublickey 等）は meta 取得後に埋まることがあるため、遅延更新に追従する
		watch(
			() => [instance.swPublickey, instance.enableServiceWorker] as const,
			() => {
				void syncPushRegistrationState();
			},
		);
	});
}

defineExpose({
	pushRegistrationInServer: pushRegistrationInServer,
});
</script>
