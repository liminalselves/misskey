<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/app-client" :label="i18n.ts.appClientSettings" :keywords="['app', 'client', 'mobile', 'version']" icon="ti ti-device-mobile">
	<div class="_gaps_m">
		<MkInfo v-if="!isEmbeddedAppShell()">{{ i18n.ts.appClientPageOnlyInApp }}</MkInfo>

		<template v-else>
			<MkInfo v-if="!appInfo">{{ i18n.ts.appClientDataUnavailable }}</MkInfo>

			<template v-else>
				<FormSection v-if="serverAnnouncement" first>
					<template #label>{{ i18n.ts.appClientInstanceNoticeSection }}</template>
					<MkInfo>{{ serverAnnouncement }}</MkInfo>
				</FormSection>

				<FormSection :first="!serverAnnouncement">
					<template #label>{{ i18n.ts.appClientAboutSection }}</template>
					<div class="_gaps_s">
						<MkKeyValue>
							<template #key>{{ i18n.ts.appClientAppName }}</template>
							<template #value>{{ appInfo.appName }}</template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>{{ i18n.ts.appClientVersion }}</template>
							<template #value><span class="_monospace">{{ appInfo.version }}</span></template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>{{ i18n.ts.appClientBuildNumber }}</template>
							<template #value><span class="_monospace">{{ appInfo.buildNumber }}</span></template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>{{ i18n.ts.appClientPackageName }}</template>
							<template #value><span class="_monospace">{{ appInfo.packageName }}</span></template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>{{ i18n.ts.appClientPlatform }}</template>
							<template #value>{{ platformLabel }}</template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>{{ i18n.ts.appClientConnectedInstance }}</template>
							<template #value><span class="_monospace">{{ instanceOrigin }}</span></template>
						</MkKeyValue>
					</div>
				</FormSection>

				<FormSection>
					<template #label>{{ i18n.ts.appClientUpdatesSection }}</template>
					<div class="_gaps_m">
						<FormInfo>{{ i18n.ts.appClientCheckForUpdatesDescription }}</FormInfo>
						<MkButton primary :disabled="checkingUpdate" @click="requestCheckUpdate">
							<i class="ti ti-refresh"></i> {{ i18n.ts.appClientCheckForUpdates }}
						</MkButton>
					</div>
				</FormSection>
			</template>
		</template>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { compareVersions } from 'compare-versions';
import FormSection from '@/components/form/section.vue';
import FormInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { instance, fetchInstance } from '@/instance.js';
import * as os from '@/os.js';
import { isEmbeddedAppShell } from '@/utility/is-embedded-app-shell.js';

type LiminalAppInfo = {
	appName: string;
	version: string;
	buildNumber: string;
	packageName: string;
	platform: string;
};

const appInfo = ref<LiminalAppInfo | null>(null);
const checkingUpdate = ref(false);

const instanceOrigin = computed(() => window.location.origin);

const platformLabel = computed(() => {
	const p = appInfo.value?.platform;
	if (p === 'android') return i18n.ts.appClientPlatformAndroid;
	if (p === 'ios') return i18n.ts.appClientPlatformIos;
	return p ?? '—';
});

const serverAnnouncement = computed(() => {
	const t = instance.nativeClientAppInfo?.announcement?.trim();
	return t && t.length > 0 ? t : null;
});

function readAppInfoFromWindow() {
	const w = window as unknown as { __LIMINAL_APP_INFO__?: LiminalAppInfo };
	const v = w.__LIMINAL_APP_INFO__;
	if (v && typeof v.version === 'string' && typeof v.buildNumber === 'string') {
		appInfo.value = v;
	} else {
		appInfo.value = null;
	}
}

function isNewerRemoteVersion(remote: string, local: string): boolean {
	const r = remote.trim();
	const l = local.trim();
	if (!r) return false;
	try {
		return compareVersions(r, l) > 0;
	} catch {
		return false;
	}
}

async function requestCheckUpdate() {
	if (checkingUpdate.value) return;
	checkingUpdate.value = true;
	try {
		await fetchInstance(true);
		const platform = appInfo.value?.platform;
		const info = instance.nativeClientAppInfo;
		const latest = (platform === 'ios'
			? info?.latestIosVersion
			: info?.latestAndroidVersion)?.trim() ?? '';
		const downloadUrlRaw = platform === 'ios'
			? info?.iosDownloadUrl
			: info?.androidDownloadUrl;
		const downloadUrl = downloadUrlRaw?.trim() ?? '';
		const releaseNotesUrl = info?.releaseNotesUrl?.trim() ?? '';

		if (!latest) {
			await os.alert({
				type: 'info',
				text: i18n.ts.appClientNoServerVersionConfigured,
			});
			return;
		}

		const local = appInfo.value?.version?.trim() ?? '';
		if (!isNewerRemoteVersion(latest, local)) {
			await os.alert({
				type: 'success',
				text: i18n.ts.appClientAlreadyLatest,
			});
			return;
		}

		const lines = [
			i18n.ts.appClientUpdateAvailableLatestLabel + latest,
			i18n.ts.appClientUpdateAvailableYoursLabel + (local || '—'),
		];
		if (releaseNotesUrl && URL.canParse(releaseNotesUrl)) {
			lines.push('', i18n.ts.appClientReleaseNotesHint);
		}
		const text = lines.join('\n');

		if (downloadUrl && URL.canParse(downloadUrl)) {
			const r = await os.actions({
				type: 'info',
				title: i18n.ts.appClientUpdateAvailableTitle,
				text,
				actions: [
					{ value: 'open', text: i18n.ts.appClientOpenDownload, primary: true },
					{ value: 'close', text: i18n.ts.close },
				],
			});
			if (!r.canceled && r.result === 'open') {
				window.open(downloadUrl, '_blank', 'noopener');
			}
		} else {
			await os.alert({
				type: 'info',
				title: i18n.ts.appClientUpdateAvailableTitle,
				text,
			});
		}
	} finally {
		checkingUpdate.value = false;
	}
}

onMounted(() => {
	readAppInfoFromWindow();
	window.addEventListener('liminal-app-info-updated', readAppInfoFromWindow);
});

onUnmounted(() => {
	window.removeEventListener('liminal-app-info-updated', readAppInfoFromWindow);
});

definePage(() => ({
	title: i18n.ts.appClientSettings,
	icon: 'ti ti-device-mobile',
}));
</script>
