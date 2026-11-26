<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker path="/admin/app-settings" :label="i18n.ts.adminAppSettings" :keywords="['app', 'mobile', 'push', 'aliyun', 'native', 'client', 'apk', 'ios', 'github']" icon="ti ti-device-mobile">
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

				<SearchMarker v-slot="slotProps" :keywords="['native', 'app', 'client', 'mobile', 'apk', 'ios', 'version', 'github', 'release', 'proxy']">
					<MkFolder :defaultOpen="slotProps.isParentOfTarget">
						<template #icon><SearchIcon><i class="ti ti-apps"></i></SearchIcon></template>
						<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfo }}</SearchLabel></template>
						<template v-if="nativeClientAppInfoForm.modified.value" #footer>
							<MkFormFooter :form="nativeClientAppInfoForm"/>
						</template>

						<div class="_gaps">
							<MkInfo>{{ i18n.ts.nativeClientAppInfoDescription }}</MkInfo>

							<SearchMarker>
								<MkSwitch v-model="nativeClientAppInfoForm.state.autoFetchGithub">
									<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfoAutoFetchGithub }}</SearchLabel><span v-if="nativeClientAppInfoForm.modifiedStates.autoFetchGithub" class="_modified">{{ i18n.ts.modified }}</span></template>
									<template #caption><SearchText>{{ i18n.ts.nativeClientAppInfoAutoFetchGithubCaption }}</SearchText></template>
								</MkSwitch>
							</SearchMarker>

							<FormSplit :minWidth="280">
								<SearchMarker>
									<MkInput v-model="nativeClientAppInfoForm.state.githubRepo" placeholder="liminalselves/liminalselves_app">
										<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfoGithubRepo }}</SearchLabel><span v-if="nativeClientAppInfoForm.modifiedStates.githubRepo" class="_modified">{{ i18n.ts.modified }}</span></template>
										<template #caption><SearchText>{{ i18n.ts.nativeClientAppInfoGithubRepoCaption }}</SearchText></template>
										<template #prefix><i class="ti ti-brand-github"></i></template>
									</MkInput>
								</SearchMarker>
								<SearchMarker>
									<MkInput v-model="nativeClientAppInfoForm.state.githubDownloadProxy" type="url" placeholder="https://ghfast.top/">
										<template #label><SearchLabel>{{ i18n.ts.nativeClientAppInfoGithubDownloadProxy }}</SearchLabel><span v-if="nativeClientAppInfoForm.modifiedStates.githubDownloadProxy" class="_modified">{{ i18n.ts.modified }}</span></template>
										<template #caption><SearchText>{{ i18n.ts.nativeClientAppInfoGithubDownloadProxyCaption }}</SearchText></template>
										<template #prefix><i class="ti ti-world-download"></i></template>
									</MkInput>
								</SearchMarker>
							</FormSplit>

							<div class="_panel _gaps_s" :class="$style.syncBox">
								<div :class="$style.syncHead">
									<div class="_title">{{ i18n.ts.nativeClientAppInfoGithubSyncSection }}</div>
									<MkButton primary :disabled="syncingReleases" @click="syncReleasesNow">
										<i class="ti ti-refresh"></i> {{ i18n.ts.nativeClientAppInfoSyncNow }}
									</MkButton>
								</div>
								<FormSplit :minWidth="200">
									<MkKeyValue>
										<template #key>{{ i18n.ts.nativeClientAppInfoSyncedAndroid }}</template>
										<template #value>
											<span class="_monospace">{{ syncStatus.latestAndroidVersion ? `v${syncStatus.latestAndroidVersion}` : '-' }}</span>
										</template>
									</MkKeyValue>
									<MkKeyValue>
										<template #key>{{ i18n.ts.nativeClientAppInfoSyncedIos }}</template>
										<template #value>
											<span class="_monospace">{{ syncStatus.latestIosVersion ? `v${syncStatus.latestIosVersion}` : '-' }}</span>
										</template>
									</MkKeyValue>
									<MkKeyValue>
										<template #key>{{ i18n.ts.nativeClientAppInfoSyncedReleaseCount }}</template>
										<template #value>
											<span class="_monospace">{{ syncStatus.releaseCount }}</span>
										</template>
									</MkKeyValue>
									<MkKeyValue>
										<template #key>{{ i18n.ts.nativeClientAppInfoSyncedAt }}</template>
										<template #value>
											<MkTime v-if="syncStatus.syncedAt" :time="syncStatus.syncedAt" mode="detail"/>
											<span v-else>{{ i18n.ts.nativeClientAppInfoNeverSynced }}</span>
										</template>
									</MkKeyValue>
								</FormSplit>
								<MkInfo v-if="syncStatus.syncError" warn>
									{{ i18n.ts.nativeClientAppInfoSyncError }}: {{ syncStatus.syncError }}
								</MkInfo>
							</div>

							<div class="_gaps_s">
								<div class="_title">{{ i18n.ts.nativeClientAppInfoManualFallbackTitle }}</div>
								<MkInfo v-if="nativeClientAppInfoForm.state.autoFetchGithub">{{ i18n.ts.nativeClientAppInfoManualFallbackNotice }}</MkInfo>
							</div>

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
import { computed, onMounted, ref } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkKeyValue from '@/components/MkKeyValue.vue';
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
	autoFetchGithub?: boolean;
	githubRepo?: string | null;
	githubDownloadProxy?: string | null;
	latestAndroidVersion?: string | null;
	latestIosVersion?: string | null;
	minRequiredAppVersion?: string | null;
	androidDownloadUrl?: string | null;
	iosDownloadUrl?: string | null;
	changelog?: unknown;
	announcement?: string | null;
};

type SyncStatusView = {
	repo: string;
	autoFetchGithub: boolean;
	syncedAt: string | null;
	syncError: string | null;
	latestAndroidVersion: string | null;
	latestIosVersion: string | null;
	releaseCount: number;
};

type AppReleasesSummaryResponse = {
	repo: string;
	autoFetchGithub: boolean;
	syncedAt: string | null;
	syncError: string | null;
	latest: {
		android: { version: string } | null;
		ios: { version: string } | null;
	};
	releases: unknown[];
};

type SyncReleasesResponse = {
	ok: boolean;
	repo: string;
	autoFetchGithub: boolean;
	syncedAt: string | null;
	error: string | null;
	latestAndroidVersion: string | null;
	latestIosVersion: string | null;
	releaseCount: number;
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

const syncStatus = ref<SyncStatusView>({
	repo: nativeClientAppInfoDefaults.githubRepo ?? 'liminalselves/liminalselves_app',
	autoFetchGithub: nativeClientAppInfoDefaults.autoFetchGithub !== false,
	syncedAt: null,
	syncError: null,
	latestAndroidVersion: nativeClientAppInfoDefaults.latestAndroidVersion ?? null,
	latestIosVersion: nativeClientAppInfoDefaults.latestIosVersion ?? null,
	releaseCount: 0,
});
const syncingReleases = ref(false);

async function loadSyncStatus() {
	try {
		const res = await (misskeyApi as unknown as (ep: string, data?: Record<string, unknown>) => Promise<AppReleasesSummaryResponse>)('app/releases', {});
		syncStatus.value = {
			repo: res.repo,
			autoFetchGithub: res.autoFetchGithub,
			syncedAt: res.syncedAt,
			syncError: res.syncError,
			latestAndroidVersion: res.latest?.android?.version ?? null,
			latestIosVersion: res.latest?.ios?.version ?? null,
			releaseCount: Array.isArray(res.releases) ? res.releases.length : 0,
		};
	} catch {
		// Keep existing status if endpoint is unavailable
	}
}

onMounted(() => {
	void loadSyncStatus();
});

async function syncReleasesNow() {
	if (syncingReleases.value) return;
	syncingReleases.value = true;
	try {
		const res = await (os.apiWithDialog as unknown as (ep: string, data?: Record<string, unknown>) => Promise<SyncReleasesResponse>)('admin/app/sync-releases', {});
		syncStatus.value = {
			repo: res.repo,
			autoFetchGithub: res.autoFetchGithub,
			syncedAt: res.syncedAt,
			syncError: res.error,
			latestAndroidVersion: res.latestAndroidVersion,
			latestIosVersion: res.latestIosVersion,
			releaseCount: res.releaseCount,
		};
		fetchInstance(true);
		if (res.ok) {
			os.alert({
				type: 'success',
				text: i18n.tsx.nativeClientAppInfoSyncSuccess({
					repo: res.repo,
					count: String(res.releaseCount),
				}),
			});
		} else {
			os.alert({
				type: 'error',
				text: i18n.tsx.nativeClientAppInfoSyncFailed({
					error: res.error ?? i18n.ts.somethingHappened,
				}),
			});
		}
	} catch {
		// os.apiWithDialog already displays the error dialog
	} finally {
		syncingReleases.value = false;
	}
}

function normalizeChangelog(items: NativeClientChangelogItem[]): NativeClientChangelogItem[] {
	return items
		.map((item) => ({
			version: item.version.trim(),
			content: item.content.trim(),
		}))
		.filter((item) => item.version.length > 0 || item.content.length > 0);
}

const nativeClientAppInfoForm = useForm({
	autoFetchGithub: nativeClientAppInfoDefaults.autoFetchGithub !== false,
	githubRepo: nativeClientAppInfoDefaults.githubRepo ?? '',
	githubDownloadProxy: nativeClientAppInfoDefaults.githubDownloadProxy ?? '',
	latestAndroidVersion: nativeClientAppInfoDefaults.latestAndroidVersion ?? '',
	latestIosVersion: nativeClientAppInfoDefaults.latestIosVersion ?? '',
	minRequiredAppVersion: nativeClientAppInfoDefaults.minRequiredAppVersion ?? '',
	androidDownloadUrl: nativeClientAppInfoDefaults.androidDownloadUrl ?? '',
	iosDownloadUrl: nativeClientAppInfoDefaults.iosDownloadUrl ?? '',
	changelog: initialChangelog as NativeClientChangelogItem[],
	announcement: nativeClientAppInfoDefaults.announcement ?? '',
}, async (state) => {
	const changelog = normalizeChangelog(state.changelog);
	const githubRepo = state.githubRepo.trim();
	const githubDownloadProxy = state.githubDownloadProxy.trim();
	await os.apiWithDialog('admin/update-meta', {
		nativeClientAppInfo: {
			autoFetchGithub: state.autoFetchGithub,
			githubRepo: githubRepo === '' ? null : githubRepo,
			githubDownloadProxy: githubDownloadProxy === '' ? null : githubDownloadProxy,
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
	void loadSyncStatus();
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

<style lang="scss" module>
.syncBox {
	padding: 14px;
	border: 1px solid var(--MI_THEME-divider);
}

.syncHead {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px 12px;
}
</style>
