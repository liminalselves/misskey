<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" :class="$style.appPage">
		<div class="_gaps_l" :class="$style.mainStack">
			<div class="_panel _gaps_s" :class="$style.hero">
				<div :class="$style.heroTop">
					<div :class="$style.heroTitleWrap">
						<div :class="$style.heroTitle">Liminalselves</div>
						<div :class="$style.heroSub">{{ heroSubtitle }}</div>
					</div>
					<div :class="$style.heroTag">{{ i18n.ts.appClientSettings }}</div>
				</div>

				<div :class="$style.heroMeta">
					<span :class="$style.metaChip">
						<i class="ti ti-brand-github"></i>
						{{ sourceLabel }}
					</span>
					<span v-if="effectiveSyncedAt" :class="$style.metaChip">
						<i class="ti ti-clock"></i>
						{{ i18n.ts.appDownloadLastSynced }}
						<MkTime :time="effectiveSyncedAt" mode="relative"/>
					</span>
					<span v-if="effectiveMinRequiredVersion" :class="$style.metaChip">
						<i class="ti ti-shield-check"></i>
						{{ i18n.tsx.appDownloadMinRequiredVersion({ version: effectiveMinRequiredVersion }) }}
					</span>
					<a
						v-if="repoUrl"
						:href="repoUrl"
						target="_blank"
						rel="noopener noreferrer"
						class="_link"
						:class="$style.repoLink"
					>
						<i class="ti ti-external-link"></i>
						{{ i18n.ts.appDownloadViewOnGithub }}
					</a>
				</div>
			</div>

			<MkLoading v-if="loading && !hasDisplayData"/>

			<MkResult v-else-if="loadError && !hasDisplayData" type="error" :text="i18n.ts.appDownloadLoadFailed">
				<MkButton primary rounded @click="loadReleases">
					<i class="ti ti-refresh"></i> {{ i18n.ts.retry }}
				</MkButton>
			</MkResult>

			<template v-else>
				<MkInfo v-if="clientPlatform === 'desktop' || clientPlatform === 'unknown'">
					<div :class="$style.desktopNoticeTitle">{{ i18n.ts.appDownloadDesktopNoticeTitle }}</div>
					<div>{{ i18n.ts.appDownloadDesktopNoticeBody }}</div>
				</MkInfo>

				<FormSection :class="$style.sectionBlock">
					<template #label>{{ i18n.ts.download }}</template>
					<FormSplit :class="$style.sectionBody" :minWidth="280">
						<div
							class="_panel _gaps_m"
							:class="[$style.card, { [$style.cardFeatured]: clientPlatform === 'android' }]"
						>
							<div :class="$style.cardHead">
								<div :class="$style.platformWrap">
									<div :class="$style.platform">
										<i class="ti ti-brand-android"></i>
										{{ i18n.ts.appClientPlatformAndroid }}
									</div>
									<span v-if="clientPlatform === 'android'" :class="$style.recommendedBadge">
										{{ i18n.ts.appDownloadRecommendedForDevice }}
									</span>
								</div>
								<div class="_monospace" :class="$style.version">
									{{ androidCard.version ? `v${androidCard.version}` : '-' }}
								</div>
							</div>

							<div v-if="androidCard.hasMeta" :class="$style.assetMetaList">
								<div v-if="androidCard.publishedDate" :class="$style.assetMetaRow">
									<span :class="$style.assetMetaLabel"><i class="ti ti-calendar"></i> {{ i18n.tsx.appDownloadReleaseDate({ date: androidCard.publishedDate }) }}</span>
								</div>
								<div v-if="androidCard.assetName" :class="$style.assetMetaRow">
									<span :class="$style.assetMetaLabel">{{ i18n.ts.appDownloadFileName }}</span>
									<span class="_monospace _selectable" :class="$style.assetMetaValue">{{ androidCard.assetName }}</span>
								</div>
								<div v-if="androidCard.sizeText" :class="$style.assetMetaRow">
									<span :class="$style.assetMetaLabel">{{ i18n.ts.appDownloadFileSize }}</span>
									<span class="_monospace" :class="$style.assetMetaValue">{{ androidCard.sizeText }}</span>
								</div>
								<div v-if="androidCard.downloadCountText" :class="$style.assetMetaRow">
									<span :class="$style.assetMetaLabel">{{ i18n.ts.appDownloadCount }}</span>
									<span class="_monospace" :class="$style.assetMetaValue">{{ androidCard.downloadCountText }}</span>
								</div>
								<div v-if="androidCard.sha256" :class="$style.assetMetaRow">
									<span :class="$style.assetMetaLabel">{{ i18n.ts.appDownloadSha256 }}</span>
									<span :class="$style.shaWrap">
										<span class="_monospace _selectable" :class="$style.shaShort" :title="androidCard.sha256">{{ androidCard.sha256Short }}</span>
										<button
											type="button"
											class="_button"
											:class="$style.copyButton"
											:aria-label="i18n.ts.appDownloadCopySha256"
											:title="i18n.ts.appDownloadCopySha256"
											@click="copyToClipboard(androidCard.sha256)"
										>
											<i class="ti ti-copy"></i>
										</button>
									</span>
								</div>
							</div>

							<div :class="$style.cardActions">
								<MkButton primary rounded full :disabled="!androidCard.canDownload" @click="openExternal(androidCard.downloadUrl)">
									<i class="ti ti-download"></i>
									{{ androidCard.canDownload ? i18n.ts.download : temporaryUnavailableText }}
								</MkButton>
								<a
									v-if="androidCard.canOpenRelease"
									:href="androidCard.releaseUrl"
									target="_blank"
									rel="noopener noreferrer"
									class="_link"
									:class="$style.releaseLink"
								>
									<i class="ti ti-brand-github"></i>
									{{ i18n.ts.appDownloadViewRelease }}
								</a>
							</div>
							<div v-if="androidCard.downloadUrl" class="_monospace _selectable" :class="$style.urlText">{{ androidCard.downloadUrl }}</div>
						</div>

						<div
							class="_panel _gaps_m"
							:class="[$style.card, { [$style.cardFeatured]: clientPlatform === 'ios' }]"
						>
							<div :class="$style.cardHead">
								<div :class="$style.platformWrap">
									<div :class="$style.platform">
										<i class="ti ti-brand-apple"></i>
										{{ i18n.ts.appClientPlatformIos }}
									</div>
									<span v-if="clientPlatform === 'ios'" :class="$style.recommendedBadge">
										{{ i18n.ts.appDownloadRecommendedForDevice }}
									</span>
								</div>
								<div class="_monospace" :class="$style.version">
									{{ iosCard.version ? `v${iosCard.version}` : '-' }}
								</div>
							</div>

							<div v-if="iosCard.hasMeta" :class="$style.assetMetaList">
								<div v-if="iosCard.publishedDate" :class="$style.assetMetaRow">
									<span :class="$style.assetMetaLabel"><i class="ti ti-calendar"></i> {{ i18n.tsx.appDownloadReleaseDate({ date: iosCard.publishedDate }) }}</span>
								</div>
								<div v-if="iosCard.assetName" :class="$style.assetMetaRow">
									<span :class="$style.assetMetaLabel">{{ i18n.ts.appDownloadFileName }}</span>
									<span class="_monospace _selectable" :class="$style.assetMetaValue">{{ iosCard.assetName }}</span>
								</div>
								<div v-if="iosCard.sizeText" :class="$style.assetMetaRow">
									<span :class="$style.assetMetaLabel">{{ i18n.ts.appDownloadFileSize }}</span>
									<span class="_monospace" :class="$style.assetMetaValue">{{ iosCard.sizeText }}</span>
								</div>
								<div v-if="iosCard.downloadCountText" :class="$style.assetMetaRow">
									<span :class="$style.assetMetaLabel">{{ i18n.ts.appDownloadCount }}</span>
									<span class="_monospace" :class="$style.assetMetaValue">{{ iosCard.downloadCountText }}</span>
								</div>
								<div v-if="iosCard.sha256" :class="$style.assetMetaRow">
									<span :class="$style.assetMetaLabel">{{ i18n.ts.appDownloadSha256 }}</span>
									<span :class="$style.shaWrap">
										<span class="_monospace _selectable" :class="$style.shaShort" :title="iosCard.sha256">{{ iosCard.sha256Short }}</span>
										<button
											type="button"
											class="_button"
											:class="$style.copyButton"
											:aria-label="i18n.ts.appDownloadCopySha256"
											:title="i18n.ts.appDownloadCopySha256"
											@click="copyToClipboard(iosCard.sha256)"
										>
											<i class="ti ti-copy"></i>
										</button>
									</span>
								</div>
							</div>

							<div :class="$style.cardActions">
								<MkButton primary rounded full :disabled="!iosCard.canDownload" @click="openExternal(iosCard.downloadUrl)">
									<i class="ti ti-download"></i>
									{{ iosCard.canDownload ? i18n.ts.download : temporaryUnavailableText }}
								</MkButton>
								<a
									v-if="iosCard.canOpenRelease"
									:href="iosCard.releaseUrl"
									target="_blank"
									rel="noopener noreferrer"
									class="_link"
									:class="$style.releaseLink"
								>
									<i class="ti ti-brand-github"></i>
									{{ i18n.ts.appDownloadViewRelease }}
								</a>
							</div>
							<div v-if="iosCard.downloadUrl" class="_monospace _selectable" :class="$style.urlText">{{ iosCard.downloadUrl }}</div>
						</div>
					</FormSplit>
				</FormSection>

				<FormSection v-if="announcementText" :class="$style.sectionBlock">
					<template #label>{{ i18n.ts.appClientInstanceNoticeSection }}</template>
					<div class="_panel _selectable" :class="[$style.sectionPanel, $style.sectionBody]">
						<div :class="$style.noticeText">{{ announcementText }}</div>
					</div>
				</FormSection>

				<FormSection :class="$style.sectionBlock">
					<template #label>{{ i18n.ts.appClientChangelog }}</template>
					<div v-if="parsedReleases.length === 0" class="_panel" :class="[$style.sectionPanel, $style.sectionBody]">-</div>
					<div v-else :class="$style.sectionBody">
						<ol :class="$style.timeline">
							<li v-for="item in visibleReleases" :key="item.key" :class="$style.timelineItem">
								<span :class="$style.timelineNode" aria-hidden="true"></span>
								<article class="_panel _gaps_s" :class="$style.releaseCard">
									<header :class="$style.releaseHead">
										<div :class="$style.releaseTitleRow">
											<span class="_monospace" :class="$style.releaseVersion">v{{ item.version }}</span>
											<span v-if="item.displayName" :class="$style.releaseName">{{ item.displayName }}</span>
											<span v-if="item.publishedDate" :class="$style.releaseDate">{{ item.publishedDate }}</span>
										</div>
										<div :class="$style.releaseBadges">
											<span v-if="item.isLatest" :class="[$style.badge, $style.badgeLatest]">
												{{ i18n.ts.appDownloadLatestBadge }}
											</span>
											<span v-if="item.minVersion" :class="[$style.badge, $style.badgeMajor]">
												{{ i18n.ts.appDownloadImportantUpdate }}
											</span>
											<a
												v-if="item.canOpenRelease"
												:href="item.releaseUrl"
												target="_blank"
												rel="noopener noreferrer"
												class="_link"
												:class="$style.releaseHeadLink"
											>
												<i class="ti ti-external-link"></i>
												GitHub
											</a>
										</div>
									</header>

									<div v-if="item.minVersion" :class="$style.minVersionBanner">
										<i class="ti ti-alert-triangle"></i>
										<span>{{ i18n.tsx.appDownloadMinVersionNote({ version: item.minVersion }) }}</span>
									</div>

									<div v-if="item.parsed.summary.length > 0" :class="$style.notesSummary">
										<template v-for="(block, bIdx) in item.parsed.summary" :key="bIdx">
											<p v-if="block.type === 'paragraph'" :class="$style.notesParagraph">
												<template v-for="(tok, tIdx) in block.tokens" :key="tIdx">
													<code v-if="tok.type === 'code'" :class="$style.inlineCode">{{ tok.text }}</code>
													<strong v-else-if="tok.type === 'strong'">{{ tok.text }}</strong>
													<a v-else-if="tok.type === 'link'" :href="tok.href" target="_blank" rel="noopener noreferrer" class="_link">{{ tok.text }}</a>
													<template v-else>{{ tok.text }}</template>
												</template>
											</p>
											<ul v-else :class="$style.notesList">
												<li v-for="(liTokens, lIdx) in block.items" :key="lIdx">
													<template v-for="(tok, tIdx) in liTokens" :key="tIdx">
														<code v-if="tok.type === 'code'" :class="$style.inlineCode">{{ tok.text }}</code>
														<strong v-else-if="tok.type === 'strong'">{{ tok.text }}</strong>
														<a v-else-if="tok.type === 'link'" :href="tok.href" target="_blank" rel="noopener noreferrer" class="_link">{{ tok.text }}</a>
														<template v-else>{{ tok.text }}</template>
													</template>
												</li>
											</ul>
										</template>
									</div>

									<section v-for="(sec, sIdx) in item.parsed.sections" :key="sIdx" :class="$style.notesSection">
										<h4 :class="$style.notesSectionTitle">
											<span
												:class="[
													$style.secDot,
													{
														[$style.secAdd]: sec.kind === 'add',
														[$style.secImp]: sec.kind === 'imp',
														[$style.secFix]: sec.kind === 'fix',
													},
												]"
												aria-hidden="true"
											></span>
											<span>{{ sec.title }}</span>
										</h4>
										<template v-for="(block, bIdx) in sec.blocks" :key="bIdx">
											<p v-if="block.type === 'paragraph'" :class="$style.notesParagraph">
												<template v-for="(tok, tIdx) in block.tokens" :key="tIdx">
													<code v-if="tok.type === 'code'" :class="$style.inlineCode">{{ tok.text }}</code>
													<strong v-else-if="tok.type === 'strong'">{{ tok.text }}</strong>
													<a v-else-if="tok.type === 'link'" :href="tok.href" target="_blank" rel="noopener noreferrer" class="_link">{{ tok.text }}</a>
													<template v-else>{{ tok.text }}</template>
												</template>
											</p>
											<ul v-else :class="$style.notesList">
												<li v-for="(liTokens, lIdx) in block.items" :key="lIdx">
													<template v-for="(tok, tIdx) in liTokens" :key="tIdx">
														<code v-if="tok.type === 'code'" :class="$style.inlineCode">{{ tok.text }}</code>
														<strong v-else-if="tok.type === 'strong'">{{ tok.text }}</strong>
														<a v-else-if="tok.type === 'link'" :href="tok.href" target="_blank" rel="noopener noreferrer" class="_link">{{ tok.text }}</a>
														<template v-else>{{ tok.text }}</template>
													</template>
												</li>
											</ul>
										</template>
									</section>

									<div
										v-if="item.parsed.summary.length === 0 && item.parsed.sections.length === 0"
										:class="$style.emptyNotes"
									>
										{{ i18n.ts.appDownloadNoReleaseNotes }}
									</div>
								</article>
							</li>
						</ol>

						<div v-if="parsedReleases.length > COLLAPSE_AFTER" :class="$style.moreRow">
							<MkButton rounded @click="showAllReleases = !showAllReleases">
								<i :class="showAllReleases ? 'ti ti-chevron-up' : 'ti ti-chevron-down'"></i>
								{{ showAllReleases
									? i18n.ts.appDownloadHideOlderReleases
									: i18n.tsx.appDownloadShowOlderReleases({ count: String(parsedReleases.length - COLLAPSE_AFTER) }) }}
							</MkButton>
						</div>
					</div>
				</FormSection>
			</template>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { compareVersions } from 'compare-versions';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import FormSection from '@/components/form/section.vue';
import FormSplit from '@/components/form/split.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { instance, fetchInstance } from '@/instance.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import {
	detectClientPlatform,
	formatBytes,
	formatReleaseDate,
	isSafeHttpUrl,
	parseReleaseNotes,
	shortenSha256,
} from '@/utility/app-release-notes.js';
import type { ParsedReleaseNotes } from '@/utility/app-release-notes.js';

type AppReleaseAsset = {
	name: string;
	size: number;
	sha256: string | null;
	downloadUrl: string;
	rawDownloadUrl: string;
	downloadCount: number;
};

type AppLatestPlatform = {
	version: string;
	tagName: string;
	name: string;
	publishedAt: string | null;
	releaseUrl: string | null;
	minVersion: string | null;
	notes: string;
	assetName: string | null;
	size: number | null;
	sha256: string | null;
	downloadUrl: string | null;
	rawDownloadUrl: string | null;
	downloadCount: number | null;
};

type AppReleaseItem = {
	version: string;
	tagName: string;
	name: string;
	publishedAt: string | null;
	releaseUrl: string | null;
	minVersion: string | null;
	notes: string;
	isLatest: boolean;
	assets: { android?: AppReleaseAsset; ios?: AppReleaseAsset };
};

type AppReleasesResponse = {
	repo: string;
	autoFetchGithub: boolean;
	syncedAt: string | null;
	syncError: string | null;
	announcement: string | null;
	minRequiredAppVersion: string | null;
	latest: { android: AppLatestPlatform | null; ios: AppLatestPlatform | null };
	releases: AppReleaseItem[];
};

type NativeClientChangelogItem = {
	version: string;
	content: string;
};

type NativeClientAppInfoLike = {
	latestAndroidVersion?: string;
	latestIosVersion?: string;
	minRequiredAppVersion?: string;
	androidDownloadUrl?: string;
	iosDownloadUrl?: string;
	changelog?: unknown;
	announcement?: string;
};

type PlatformCardView = {
	version: string;
	publishedDate: string;
	assetName: string;
	sizeText: string;
	downloadCountText: string;
	sha256: string;
	sha256Short: string;
	downloadUrl: string;
	canDownload: boolean;
	releaseUrl: string;
	canOpenRelease: boolean;
	hasMeta: boolean;
};

type TimelineReleaseView = {
	key: string;
	version: string;
	displayName: string;
	publishedDate: string;
	isLatest: boolean;
	minVersion: string | null;
	releaseUrl: string;
	canOpenRelease: boolean;
	parsed: ParsedReleaseNotes;
};

const COLLAPSE_AFTER = 3;
const VALID_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const loading = ref(false);
const loadError = ref(false);
const releasesData = ref<AppReleasesResponse | null>(null);
const showAllReleases = ref(false);

const clientPlatform = detectClientPlatform(
	typeof navigator !== 'undefined' ? navigator.userAgent : '',
	typeof navigator !== 'undefined' ? (navigator.maxTouchPoints ?? 0) : 0,
);

const appInfo = computed<NativeClientAppInfoLike>(() => (instance.nativeClientAppInfo ?? {}) as NativeClientAppInfoLike);

const sortedFallbackChangelog = computed(() => {
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

const hasFallbackData = computed(() => {
	const info = appInfo.value;
	return Boolean(
		info.latestAndroidVersion?.trim()
		|| info.latestIosVersion?.trim()
		|| info.androidDownloadUrl?.trim()
		|| info.iosDownloadUrl?.trim()
		|| info.announcement?.trim()
		|| sortedFallbackChangelog.value.length > 0,
	);
});

const hasDisplayData = computed(() => releasesData.value != null || hasFallbackData.value);

async function loadReleases() {
	if (loading.value) return;
	loading.value = true;
	loadError.value = false;
	try {
		const [res] = await Promise.all([
			(misskeyApi as unknown as (ep: string, data?: Record<string, unknown>) => Promise<AppReleasesResponse>)('app/releases', {}),
			fetchInstance(true).catch(() => null),
		]);
		releasesData.value = res;
	} catch {
		loadError.value = true;
	} finally {
		loading.value = false;
	}
}

onMounted(() => {
	void loadReleases();
});

const announcementText = computed(() => {
	const fromApi = releasesData.value?.announcement?.trim();
	if (fromApi) return fromApi;
	return appInfo.value.announcement?.trim() || '';
});

const heroSubtitle = computed(() => announcementText.value || i18n.ts.appDownloadHeroDescription);

const effectiveSyncedAt = computed(() => releasesData.value?.syncedAt ?? null);

const effectiveMinRequiredVersion = computed(() => {
	const fromApi = releasesData.value?.minRequiredAppVersion?.trim();
	if (fromApi) return fromApi;
	return appInfo.value.minRequiredAppVersion?.trim() || '';
});

const sourceLabel = computed(() => {
	if (releasesData.value?.autoFetchGithub) return i18n.ts.appDownloadSourceGithub;
	return i18n.ts.appDownloadSourceFallback;
});

const repoUrl = computed(() => {
	const repo = releasesData.value?.repo?.trim() ?? '';
	if (!VALID_REPO_RE.test(repo)) return '';
	return `https://github.com/${repo}`;
});

function buildPlatformCard(
	latest: AppLatestPlatform | null | undefined,
	fallbackVersion: string | undefined,
	fallbackUrl: string | undefined,
): PlatformCardView {
	const version = latest?.version?.trim() || fallbackVersion?.trim() || '';
	const downloadUrl = latest?.downloadUrl?.trim() || fallbackUrl?.trim() || '';
	const releaseUrl = latest?.releaseUrl?.trim() || '';
	const publishedDate = formatReleaseDate(latest?.publishedAt);
	const assetName = latest?.assetName?.trim() || '';
	const sizeText = formatBytes(latest?.size);
	const downloadCount = latest?.downloadCount;
	const downloadCountText = downloadCount != null && downloadCount > 0
		? i18n.tsx.appDownloadCountTimes({ count: downloadCount.toLocaleString() })
		: '';
	const sha256 = latest?.sha256?.trim() || '';
	const sha256Short = shortenSha256(sha256);

	return {
		version,
		publishedDate,
		assetName,
		sizeText,
		downloadCountText,
		sha256,
		sha256Short,
		downloadUrl,
		canDownload: isSafeHttpUrl(downloadUrl),
		releaseUrl,
		canOpenRelease: isSafeHttpUrl(releaseUrl),
		hasMeta: Boolean(publishedDate || assetName || sizeText || downloadCountText || sha256),
	};
}

const androidCard = computed(() => buildPlatformCard(
	releasesData.value?.latest?.android,
	appInfo.value.latestAndroidVersion,
	appInfo.value.androidDownloadUrl,
));

const iosCard = computed(() => buildPlatformCard(
	releasesData.value?.latest?.ios,
	appInfo.value.latestIosVersion,
	appInfo.value.iosDownloadUrl,
));

const temporaryUnavailableText = computed(() => i18n.ts.cannotPerformTemporary);

const parsedReleases = computed<TimelineReleaseView[]>(() => {
	const apiList = releasesData.value?.releases;
	if (apiList && apiList.length > 0) {
		const hasLatestFlag = apiList.some((r) => r.isLatest);
		return apiList.map((rel, idx) => {
			const parsed = parseReleaseNotes(rel.notes);
			const rawName = rel.name?.trim() || '';
			const version = rel.version.trim();
			const displayName = rawName && rawName !== version && rawName !== `v${version}` ? rawName : '';
			const releaseUrl = rel.releaseUrl?.trim() || '';
			return {
				key: `${rel.tagName || version}-${idx}`,
				version,
				displayName,
				publishedDate: formatReleaseDate(rel.publishedAt),
				isLatest: hasLatestFlag ? rel.isLatest : idx === 0,
				minVersion: rel.minVersion ?? parsed.minVersion,
				releaseUrl,
				canOpenRelease: isSafeHttpUrl(releaseUrl),
				parsed,
			};
		});
	}

	return sortedFallbackChangelog.value.map((entry, idx) => {
		const parsed = parseReleaseNotes(entry.content);
		return {
			key: `fallback-${entry.version}-${idx}`,
			version: entry.version,
			displayName: '',
			publishedDate: '',
			isLatest: idx === 0,
			minVersion: parsed.minVersion,
			releaseUrl: '',
			canOpenRelease: false,
			parsed,
		};
	});
});

const visibleReleases = computed(() => (
	showAllReleases.value ? parsedReleases.value : parsedReleases.value.slice(0, COLLAPSE_AFTER)
));

function openExternal(url: string) {
	if (!isSafeHttpUrl(url)) return;
	window.open(url, '_blank', 'noopener,noreferrer');
}

definePage(() => ({
	title: i18n.ts.appClientSettings,
	icon: 'ti ti-device-mobile',
}));
</script>

<style lang="scss" module>
.appPage {
	--MI_SPACER-w: 820px;
	--MI_SPACER-min: 18px;
	--MI_SPACER-max: 40px;
}

.mainStack {
	padding-top: 8px;
	padding-bottom: 16px;
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
		radial-gradient(circle at 0 0, color-mix(in srgb, var(--MI_THEME-accent), transparent 84%), transparent 48%),
		var(--MI_THEME-panel);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-accent), transparent 78%);
}

.heroTop {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.heroTitleWrap {
	min-width: 0;
}

.heroTag {
	flex-shrink: 0;
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
	margin-top: 4px;
	opacity: 0.82;
	line-height: 1.55;
	white-space: pre-wrap;
}

.heroMeta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 14px;
	margin-top: 6px;
	font-size: 0.85rem;
	opacity: 0.82;
}

.metaChip {
	display: inline-flex;
	align-items: center;
	gap: 5px;
}

.repoLink {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	margin-left: auto;
	font-weight: 600;
}

.desktopNoticeTitle {
	font-weight: 700;
	margin-bottom: 2px;
}

.card {
	display: flex;
	flex-direction: column;
	padding: 18px;
	border: 1px solid var(--MI_THEME-divider);
}

.cardFeatured {
	order: -1;
	border-color: var(--MI_THEME-accent);
	background:
		radial-gradient(circle at 100% 0, color-mix(in srgb, var(--MI_THEME-accent), transparent 88%), transparent 55%),
		var(--MI_THEME-panel);
}

.cardHead {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.platformWrap {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.platform {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 1.05rem;
	font-weight: 700;
}

.recommendedBadge {
	padding: 2px 9px;
	border-radius: 999px;
	font-size: 0.78rem;
	font-weight: 700;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.version {
	font-weight: 700;
	opacity: 0.9;
}

.assetMetaList {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-bg);
	font-size: 0.85rem;
}

.assetMetaRow {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	min-width: 0;
}

.assetMetaLabel {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	opacity: 0.72;
	flex-shrink: 0;
}

.assetMetaValue {
	text-align: right;
	overflow-wrap: anywhere;
}

.shaWrap {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}

.shaShort {
	opacity: 0.9;
}

.copyButton {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	border-radius: 6px;
	color: var(--MI_THEME-accent);

	&:hover {
		background: var(--MI_THEME-accentedBg);
	}
}

.cardActions {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-top: auto;
}

.releaseLink {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	font-size: 0.85rem;
	padding: 2px 0;
}

.urlText {
	font-size: 0.78rem;
	word-break: break-all;
	opacity: 0.6;
	line-height: 1.45;
}

.sectionPanel {
	padding: 16px;
}

.noticeText {
	white-space: pre-wrap;
	line-height: 1.6;
}

.timeline {
	position: relative;
	margin: 0;
	padding: 0;
	list-style: none;

	&::before {
		content: '';
		position: absolute;
		left: 5px;
		top: 18px;
		bottom: 18px;
		width: 1px;
		background: var(--MI_THEME-divider);
	}
}

.timelineItem {
	position: relative;
	padding-left: 26px;
	margin-bottom: 14px;

	&:last-child {
		margin-bottom: 0;
	}
}

.timelineNode {
	position: absolute;
	left: 0;
	top: 22px;
	width: 11px;
	height: 11px;
	border-radius: 50%;
	background: var(--MI_THEME-panel);
	border: 2px solid var(--MI_THEME-accent);
	box-sizing: border-box;
}

.releaseCard {
	padding: 16px 18px;
	border: 1px solid var(--MI_THEME-divider);
}

.releaseHead {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px 12px;
}

.releaseTitleRow {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 6px 10px;
}

.releaseVersion {
	font-size: 1.1rem;
	font-weight: 800;
}

.releaseName {
	font-weight: 600;
	opacity: 0.85;
}

.releaseDate {
	font-size: 0.85rem;
	opacity: 0.68;
}

.releaseBadges {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.badge {
	padding: 2px 10px;
	border-radius: 999px;
	font-size: 0.78rem;
	font-weight: 700;
	border: 1px solid var(--MI_THEME-divider);
}

.badgeLatest {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	border-color: color-mix(in srgb, var(--MI_THEME-accent), transparent 65%);
}

.badgeMajor {
	background: var(--MI_THEME-infoWarnBg);
	color: var(--MI_THEME-infoWarnFg);
	border-color: color-mix(in srgb, var(--MI_THEME-warn), transparent 60%);
}

.releaseHeadLink {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 0.82rem;
	margin-left: 4px;
}

.minVersionBanner {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 8px 12px;
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-infoWarnBg);
	color: var(--MI_THEME-infoWarnFg);
	font-size: 0.85rem;
}

.notesSummary {
	line-height: 1.65;
}

.notesSection {
	margin-top: 6px;
}

.notesSectionTitle {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 0 0 6px;
	font-size: 0.95rem;
	font-weight: 700;
}

.secDot {
	flex: none;
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--MI_THEME-fg);
	opacity: 0.5;
}

.secAdd {
	background: var(--MI_THEME-accent);
	opacity: 1;
}

.secImp {
	background: var(--MI_THEME-infoFg);
	opacity: 1;
}

.secFix {
	background: var(--MI_THEME-warn);
	opacity: 1;
}

.notesParagraph {
	margin: 4px 0;
	line-height: 1.65;
}

.notesList {
	margin: 4px 0;
	padding-left: 20px;
	line-height: 1.65;

	> li + li {
		margin-top: 3px;
	}
}

.inlineCode {
	padding: 0.1em 0.4em;
	border-radius: 4px;
	background: var(--MI_THEME-bg);
	font-size: 0.9em;
	word-break: break-all;
}

.emptyNotes {
	opacity: 0.65;
	font-size: 0.9rem;
}

.moreRow {
	display: flex;
	justify-content: center;
	margin-top: 16px;
}
</style>
