<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/app-settings" :label="i18n.ts.adminAppSettings" :keywords="['app', 'mobile', 'push', 'aliyun', 'native', 'client', 'apk', 'ios']" icon="ti ti-device-mobile">
			<div class="_gaps_m">
				<MkInfo>{{ i18n.ts.adminAppSettingsDescription }}</MkInfo>

				<SearchMarker v-slot="slotProps" :keywords="['aliyun', 'push', 'mobile', 'EMAS', 'native']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #icon><SearchIcon><i class="ti ti-device-mobile"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.aliyunMobilePush }}</SearchLabel></template>
						<template v-if="aliyunMobilePushForm.modified.value" #footer>
							<MkFormFooter :form="aliyunMobilePushForm"/>
						</template>

						<div class="_gaps">
							<MkInfo>{{ i18n.ts.aliyunMobilePushDescription }}</MkInfo>
							<SearchMarker>
								<MkInput v-model="aliyunMobilePushForm.state.aliyunMobilePushAccessKeyId">
									<template #label><SearchLabel>{{ i18n.ts.aliyunMobilePushAccessKeyId }}</SearchLabel><span v-if="aliyunMobilePushForm.modifiedStates.aliyunMobilePushAccessKeyId" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #prefix><i class="ti ti-key"></i></template>
								</MkInput>
							</SearchMarker>
							<SearchMarker>
								<MkInput v-model="aliyunMobilePushForm.state.aliyunMobilePushAccessKeySecret" type="password">
									<template #label><SearchLabel>{{ i18n.ts.aliyunMobilePushAccessKeySecret }}</SearchLabel><span v-if="aliyunMobilePushForm.modifiedStates.aliyunMobilePushAccessKeySecret" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #prefix><i class="ti ti-key"></i></template>
								</MkInput>
							</SearchMarker>
							<SearchMarker>
								<MkInput v-model="aliyunMobilePushForm.state.aliyunMobilePushAppKey">
									<template #label><SearchLabel>{{ i18n.ts.aliyunMobilePushAppKey }}</SearchLabel><span v-if="aliyunMobilePushForm.modifiedStates.aliyunMobilePushAppKey" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #caption><SearchText>{{ i18n.ts.aliyunMobilePushAppKeyCaption }}</SearchText></template>
									<template #prefix><i class="ti ti-apps"></i></template>
								</MkInput>
							</SearchMarker>
							<SearchMarker>
								<MkSwitch v-model="aliyunMobilePushForm.state.enableAliyunMobilePush">
									<template #label><SearchLabel>{{ i18n.ts.aliyunMobilePushEnabled }}</SearchLabel><span v-if="aliyunMobilePushForm.modifiedStates.enableAliyunMobilePush" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #caption><SearchText>{{ i18n.ts.aliyunMobilePushEnabledCaption }}</SearchText></template>
								</MkSwitch>
							</SearchMarker>
							<SearchMarker>
								<div class="_gaps_s">
									<div class="_title">{{ i18n.ts.aliyunMobilePushClearDevices }}</div>
									<MkInfo warn>{{ i18n.ts.aliyunMobilePushClearDevicesCaption }}</MkInfo>
									<div>
										<MkButton danger :disabled="clearingMobilePushDevices" @click="clearRegisteredMobilePushDevices">
											<i class="ti ti-trash"></i> {{ i18n.ts.aliyunMobilePushClearDevices }}
										</MkButton>
									</div>
								</div>
							</SearchMarker>
						</div>
					</MkFolder>
				</SearchMarker>

				<SearchMarker v-slot="slotProps" :keywords="['native', 'app', 'client', 'mobile', 'apk', 'ios', 'version']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #icon><SearchIcon><i class="ti ti-apps"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfo }}</SearchLabel></template>
						<template v-if="nativeClientAppInfoForm.modified.value" #footer>
							<MkFormFooter :form="nativeClientAppInfoForm"/>
						</template>

						<div class="_gaps">
							<MkInfo>{{ i18n.ts.nativeClientAppInfoDescription }}</MkInfo>
							<FormSplit :minWidth="280">
								<MkInput v-model="nativeClientAppInfoForm.state.latestAndroidVersion">
									<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfoLatestAndroidVersion }}</SearchLabel><span v-if="nativeClientAppInfoForm.modifiedStates.latestAndroidVersion" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #caption><SearchText>{{ i18n.ts.nativeClientAppInfoSemverHint }}</SearchText></template>
								</MkInput>
								<MkInput v-model="nativeClientAppInfoForm.state.latestIosVersion">
									<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfoLatestIosVersion }}</SearchLabel><span v-if="nativeClientAppInfoForm.modifiedStates.latestIosVersion" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #caption><SearchText>{{ i18n.ts.nativeClientAppInfoSemverHint }}</SearchText></template>
								</MkInput>
							</FormSplit>
							<MkInput v-model="nativeClientAppInfoForm.state.minRequiredAppVersion">
								<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfoMinRequiredAppVersion }}</SearchLabel><span v-if="nativeClientAppInfoForm.modifiedStates.minRequiredAppVersion" class="_modified">{{ i18n.ts.modified }}</span></template>
								<template #caption><SearchText>{{ i18n.ts.nativeClientAppInfoMinRequiredAppVersionCaption }}</SearchText></template>
							</MkInput>
							<FormSplit :minWidth="280">
								<MkInput v-model="nativeClientAppInfoForm.state.androidDownloadUrl" type="url">
									<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfoAndroidDownloadUrl }}</SearchLabel><span v-if="nativeClientAppInfoForm.modifiedStates.androidDownloadUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #prefix><i class="ti ti-link"></i></template>
								</MkInput>
								<MkInput v-model="nativeClientAppInfoForm.state.iosDownloadUrl" type="url">
									<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfoIosDownloadUrl }}</SearchLabel><span v-if="nativeClientAppInfoForm.modifiedStates.iosDownloadUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #prefix><i class="ti ti-link"></i></template>
								</MkInput>
							</FormSplit>
							<div class="_gaps_s">
								<div class="_title">{{ i18n.ts.nativeClientAppInfoChangelog }}</div>
								<MkInfo>{{ i18n.ts.nativeClientAppInfoChangelogDescription }}</MkInfo>
								<div v-for="(item, idx) in nativeClientAppInfoForm.state.changelog" :key="`cl-${idx}`" class="_gaps_s _panel">
									<FormSplit :minWidth="220">
										<MkInput v-model="item.version">
											<template #label>{{ i18n.ts.nativeClientAppInfoChangelogVersion }}</template>
											<template #caption><SearchText>{{ i18n.ts.nativeClientAppInfoSemverHint }}</SearchText></template>
										</MkInput>
										<div style="display: flex; align-items: end;">
											<MkButton danger @click="removeChangelogRow(idx)">
												<i class="ti ti-trash"></i> {{ i18n.ts.delete }}
											</MkButton>
										</div>
									</FormSplit>
									<MkTextarea v-model="item.content">
										<template #label>{{ i18n.ts.nativeClientAppInfoChangelogContent }}</template>
										<template #caption>{{ i18n.ts.nativeClientAppInfoChangelogContentCaption }}</template>
									</MkTextarea>
								</div>
								<MkButton @click="appendChangelogRow">
									<i class="ti ti-plus"></i> {{ i18n.ts.addItem }}
								</MkButton>
							</div>
							<MkTextarea v-model="nativeClientAppInfoForm.state.announcement">
								<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfoAnnouncement }}</SearchLabel><span v-if="nativeClientAppInfoForm.modifiedStates.announcement" class="_modified">{{ i18n.ts.modified }}</span></template>
							</MkTextarea>
						</div>
					</MkFolder>
				</SearchMarker>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import FormSplit from '@/components/form/split.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFolder from '@/components/MkFolder.vue';
import { useForm } from '@/composables/use-form.js';
import MkFormFooter from '@/components/MkFormFooter.vue';

const meta = await misskeyApi('admin/meta') as Record<string, unknown>;

const aliyunMobilePushForm = useForm({
	aliyunMobilePushAccessKeyId: typeof meta.aliyunMobilePushAccessKeyId === 'string' ? meta.aliyunMobilePushAccessKeyId : '',
	aliyunMobilePushAccessKeySecret: typeof meta.aliyunMobilePushAccessKeySecret === 'string' ? meta.aliyunMobilePushAccessKeySecret : '',
	aliyunMobilePushAppKey: typeof meta.aliyunMobilePushAppKey === 'string' ? meta.aliyunMobilePushAppKey : '',
	enableAliyunMobilePush: meta.enableAliyunMobilePush !== false,
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		aliyunMobilePushAccessKeyId: state.aliyunMobilePushAccessKeyId === '' ? null : state.aliyunMobilePushAccessKeyId,
		aliyunMobilePushAccessKeySecret: state.aliyunMobilePushAccessKeySecret === '' ? null : state.aliyunMobilePushAccessKeySecret,
		aliyunMobilePushAppKey: state.aliyunMobilePushAppKey === '' ? null : state.aliyunMobilePushAppKey,
		enableAliyunMobilePush: state.enableAliyunMobilePush,
	} as Record<string, unknown>);
	fetchInstance(true);
});

const clearingMobilePushDevices = ref(false);

async function clearRegisteredMobilePushDevices() {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.aliyunMobilePushClearDevices,
		text: i18n.ts.aliyunMobilePushClearDevicesConfirm,
	});
	if (canceled) return;

	clearingMobilePushDevices.value = true;
	try {
		const res = await os.apiWithDialog('admin/mobile-push/clear-devices', {});
		os.alert({
			type: 'success',
			text: i18n.tsx.aliyunMobilePushClearDevicesDone({ count: String(res.deletedCount) }),
		});
	} finally {
		clearingMobilePushDevices.value = false;
	}
}

type NativeClientChangelogItem = {
	version: string;
	content: string;
};

type NativeClientAppInfoDefaults = {
	latestAndroidVersion?: string | null;
	latestIosVersion?: string | null;
	minRequiredAppVersion?: string | null;
	androidDownloadUrl?: string | null;
	iosDownloadUrl?: string | null;
	changelog?: unknown;
	announcement?: string | null;
};

const nativeClientAppInfoDefaults = (meta.nativeClientAppInfo && typeof meta.nativeClientAppInfo === 'object'
	? meta.nativeClientAppInfo
	: {}) as NativeClientAppInfoDefaults;

const initialChangelog = Array.isArray(nativeClientAppInfoDefaults.changelog)
	? nativeClientAppInfoDefaults.changelog
		.map((entry) => ({
			version: typeof entry?.version === 'string' ? entry.version : '',
			content: typeof entry?.content === 'string' ? entry.content : '',
		}))
	: [];

function normalizeChangelog(items: NativeClientChangelogItem[]): NativeClientChangelogItem[] {
	return items
		.map((item) => ({
			version: item.version.trim(),
			content: item.content.trim(),
		}))
		.filter((item) => item.version.length > 0 || item.content.length > 0);
}

const nativeClientAppInfoForm = useForm({
	latestAndroidVersion: nativeClientAppInfoDefaults.latestAndroidVersion ?? '',
	latestIosVersion: nativeClientAppInfoDefaults.latestIosVersion ?? '',
	minRequiredAppVersion: nativeClientAppInfoDefaults.minRequiredAppVersion ?? '',
	androidDownloadUrl: nativeClientAppInfoDefaults.androidDownloadUrl ?? '',
	iosDownloadUrl: nativeClientAppInfoDefaults.iosDownloadUrl ?? '',
	changelog: initialChangelog as NativeClientChangelogItem[],
	announcement: nativeClientAppInfoDefaults.announcement ?? '',
}, async (state) => {
	const changelog = normalizeChangelog(state.changelog);
	await os.apiWithDialog('admin/update-meta', {
		nativeClientAppInfo: {
			latestAndroidVersion: state.latestAndroidVersion === '' ? null : state.latestAndroidVersion,
			latestIosVersion: state.latestIosVersion === '' ? null : state.latestIosVersion,
			minRequiredAppVersion: state.minRequiredAppVersion === '' ? null : state.minRequiredAppVersion,
			androidDownloadUrl: state.androidDownloadUrl === '' ? null : state.androidDownloadUrl,
			iosDownloadUrl: state.iosDownloadUrl === '' ? null : state.iosDownloadUrl,
			changelog,
			announcement: state.announcement === '' ? null : state.announcement,
		},
	} as Record<string, unknown>);
	fetchInstance(true);
});

function appendChangelogRow() {
	nativeClientAppInfoForm.state.changelog = [
		...nativeClientAppInfoForm.state.changelog,
		{ version: '', content: '' },
	];
}

function removeChangelogRow(index: number) {
	nativeClientAppInfoForm.state.changelog = nativeClientAppInfoForm.state.changelog
		.filter((_, i) => i !== index);
}

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.adminAppSettings,
	icon: 'ti ti-device-mobile',
}));
</script>
