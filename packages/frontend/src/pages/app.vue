<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer appPage">
		<div class="_gaps_l mainStack">
			<div class="_panel hero _gaps_s">
				<div class="heroTop">
					<div class="heroTitle">Liminalselves</div>
					<div class="heroTag">{{ i18n.ts.appClientSettings }}</div>
				</div>
				<div class="heroSub">{{ noticeText }}</div>
			</div>

			<FormSection class="sectionBlock">
				<template #label>{{ i18n.ts.download }}</template>
				<FormSplit class="sectionBody" :minWidth="280">
					<div class="_panel card _gaps_m">
						<div class="cardHead">
							<div class="platform"><i class="ti ti-brand-android"></i> {{ i18n.ts.appClientPlatformAndroid }}</div>
							<div class="version _monospace">v{{ androidVersion }}</div>
						</div>
						<MkButton primary rounded :disabled="!canDownloadAndroid" @click="openDownload(androidDownloadUrl)">
							<i class="ti ti-download"></i> {{ canDownloadAndroid ? i18n.ts.download : temporaryUnavailableText }}
						</MkButton>
						<div class="urlText _monospace">{{ androidDownloadUrlText }}</div>
					</div>

					<div class="_panel card _gaps_m">
						<div class="cardHead">
							<div class="platform"><i class="ti ti-brand-apple"></i> {{ i18n.ts.appClientPlatformIos }}</div>
							<div class="version _monospace">v{{ iosVersion }}</div>
						</div>
						<MkButton primary rounded :disabled="!canDownloadIos" @click="openDownload(iosDownloadUrl)">
							<i class="ti ti-download"></i> {{ canDownloadIos ? i18n.ts.download : temporaryUnavailableText }}
						</MkButton>
						<div class="urlText _monospace">{{ iosDownloadUrlText }}</div>
					</div>
				</FormSplit>
			</FormSection>

			<FormSection class="sectionBlock">
				<template #label>{{ i18n.ts.appClientInstanceNoticeSection }}</template>
				<div class="_panel sectionPanel sectionBody">
					<div class="noticeText">{{ noticeText }}</div>
				</div>
			</FormSection>

			<FormSection class="sectionBlock">
				<template #label>{{ i18n.ts.appClientChangelog }}</template>
				<div v-if="sortedChangelog.length === 0" class="_panel sectionPanel sectionBody">-</div>
				<div v-for="(item, idx) in sortedChangelog" :key="`changelog-${item.version}-${idx}`" class="_panel changelogItem _gaps_s sectionBody">
					<div class="changelogVersion _monospace">v{{ item.version }}</div>
					<div class="changelogContent">{{ item.content }}</div>
				</div>
			</FormSection>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted } from 'vue';
import { compareVersions } from 'compare-versions';
import MkButton from '@/components/MkButton.vue';
import FormSection from '@/components/form/section.vue';
import FormSplit from '@/components/form/split.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { instance, fetchInstance } from '@/instance.js';

onMounted(() => {
	void fetchInstance(true);
});

type NativeClientChangelogItem = {
	version: string;
	content: string;
};

type NativeClientAppInfoLike = {
	latestAndroidVersion?: string;
	latestIosVersion?: string;
	androidDownloadUrl?: string;
	iosDownloadUrl?: string;
	changelog?: unknown;
	announcement?: string;
};

const appInfo = computed<NativeClientAppInfoLike>(() => (instance.nativeClientAppInfo ?? {}) as NativeClientAppInfoLike);

const androidVersion = computed(() => appInfo.value.latestAndroidVersion?.trim() || '-');
const iosVersion = computed(() => appInfo.value.latestIosVersion?.trim() || '-');

const androidDownloadUrl = computed(() => appInfo.value.androidDownloadUrl?.trim() || '');
const iosDownloadUrl = computed(() => appInfo.value.iosDownloadUrl?.trim() || '');

const androidDownloadUrlText = computed(() => androidDownloadUrl.value || '-');
const iosDownloadUrlText = computed(() => iosDownloadUrl.value || '-');

const canDownloadAndroid = computed(() => androidDownloadUrl.value.length > 0 && URL.canParse(androidDownloadUrl.value));
const canDownloadIos = computed(() => iosDownloadUrl.value.length > 0 && URL.canParse(iosDownloadUrl.value));

const noticeText = computed(() => appInfo.value.announcement?.trim() || '-');
const temporaryUnavailableText = computed(() => i18n.ts.cannotPerformTemporary);

const sortedChangelog = computed(() => {
	if (!Array.isArray(appInfo.value.changelog)) return [] as NativeClientChangelogItem[];
	return appInfo.value.changelog
		.map((entry) => ({
			version: typeof entry?.version === 'string' ? entry.version.trim() : '',
			content: typeof entry?.content === 'string' ? entry.content.trim() : '',
		}))
		.filter((entry) => entry.version.length > 0 || entry.content.length > 0)
		.sort((a, b) => {
			try {
				return compareVersions(b.version, a.version);
			} catch {
				return b.version.localeCompare(a.version);
			}
		});
});

function openDownload(url: string) {
	if (!URL.canParse(url)) return;
	window.open(url, '_blank', 'noopener');
}

definePage(() => ({
	title: i18n.ts.appClientSettings,
	icon: 'ti ti-device-mobile',
}));
</script>

<style lang="scss" scoped>
.appPage {
	--MI_SPACER-w: 760px;
	--MI_SPACER-min: 24px;
	--MI_SPACER-max: 44px;
}

.mainStack {
	padding-top: 8px;
	padding-bottom: 8px;
}

.sectionBlock {
	margin-top: 14px;
}

.sectionBody {
	margin-top: 12px;
}

.hero {
	padding: 20px;
	background:
		radial-gradient(circle at 0 0, color-mix(in srgb, var(--MI_THEME-accent), transparent 85%), transparent 45%),
		var(--MI_THEME-panel);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-accent), transparent 80%);
}

.heroTop {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.heroTag {
	font-size: 0.85rem;
	padding: 4px 10px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-weight: 700;
}

.heroTitle {
	font-size: 1.9rem;
	font-weight: 800;
	letter-spacing: 0.01em;
}

.heroSub {
	opacity: 0.8;
	line-height: 1.5;
}

.card {
	padding: 16px;
}

.cardHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.sectionPanel {
	padding: 16px;
}

.platform {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-weight: 700;
}

.version {
	opacity: 0.9;
}

.urlText {
	font-size: 0.8rem;
	word-break: break-all;
	opacity: 0.65;
	line-height: 1.45;
}

.noticeText {
	white-space: pre-wrap;
	line-height: 1.6;
}

.changelogItem {
	padding: 16px;
	margin-bottom: 10px;
}

.changelogVersion {
	font-size: 0.95rem;
	font-weight: 700;
}

.changelogContent {
	white-space: pre-wrap;
	line-height: 1.6;
}
</style>
