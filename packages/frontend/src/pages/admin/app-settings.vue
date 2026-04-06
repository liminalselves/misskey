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
							<MkInput v-model="nativeClientAppInfoForm.state.releaseNotesUrl" type="url">
								<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfoReleaseNotesUrl }}</SearchLabel><span v-if="nativeClientAppInfoForm.modifiedStates.releaseNotesUrl" class="_modified">{{ i18n.ts.modified }}</span></template>
								<template #prefix><i class="ti ti-link"></i></template>
							</MkInput>
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
import { computed } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
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
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		aliyunMobilePushAccessKeyId: state.aliyunMobilePushAccessKeyId === '' ? null : state.aliyunMobilePushAccessKeyId,
		aliyunMobilePushAccessKeySecret: state.aliyunMobilePushAccessKeySecret === '' ? null : state.aliyunMobilePushAccessKeySecret,
		aliyunMobilePushAppKey: state.aliyunMobilePushAppKey === '' ? null : state.aliyunMobilePushAppKey,
	} as Record<string, unknown>);
	fetchInstance(true);
});

const nativeClientAppInfoDefaults = (meta.nativeClientAppInfo && typeof meta.nativeClientAppInfo === 'object'
	? meta.nativeClientAppInfo
	: {}) as Record<string, string | null | undefined>;
const nativeClientAppInfoForm = useForm({
	latestAndroidVersion: nativeClientAppInfoDefaults.latestAndroidVersion ?? '',
	latestIosVersion: nativeClientAppInfoDefaults.latestIosVersion ?? '',
	androidDownloadUrl: nativeClientAppInfoDefaults.androidDownloadUrl ?? '',
	iosDownloadUrl: nativeClientAppInfoDefaults.iosDownloadUrl ?? '',
	releaseNotesUrl: nativeClientAppInfoDefaults.releaseNotesUrl ?? '',
	announcement: nativeClientAppInfoDefaults.announcement ?? '',
}, async (state) => {
	await os.apiWithDialog('admin/update-meta', {
		nativeClientAppInfo: {
			latestAndroidVersion: state.latestAndroidVersion === '' ? null : state.latestAndroidVersion,
			latestIosVersion: state.latestIosVersion === '' ? null : state.latestIosVersion,
			androidDownloadUrl: state.androidDownloadUrl === '' ? null : state.androidDownloadUrl,
			iosDownloadUrl: state.iosDownloadUrl === '' ? null : state.iosDownloadUrl,
			releaseNotesUrl: state.releaseNotesUrl === '' ? null : state.releaseNotesUrl,
			announcement: state.announcement === '' ? null : state.announcement,
		},
	} as Record<string, unknown>);
	fetchInstance(true);
});

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.adminAppSettings,
	icon: 'ti ti-device-mobile',
}));
</script>
