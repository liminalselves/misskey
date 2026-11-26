<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" :class="$style.appPage">
		<div class="_gaps" :class="$style.mainStack">
			<div class="_panel _gaps_s" :class="$style.hero">
				<div :class="$style.heroTop">
					<div :class="$style.heroTitleWrap">
						<div :class="$style.heroTitle">Liminalselves</div>
						<div :class="$style.heroSub">{{ heroSubtitle }}</div>
					</div>
					<div :class="$style.heroTag">{{ i18n.ts.appClientSettings }}</div>
				</div>

				<div :class="$style.heroMeta">
					<span :class="$style.metaPill">
						<i class="ti ti-brand-github"></i>
						{{ sourceLabel }}
					</span>
					<span v-if="effectiveSyncedAt" :class="$style.metaPill">
						<i class="ti ti-clock"></i>
						{{ i18n.ts.appDownloadLastSynced }}
						<MkTime :time="effectiveSyncedAt" mode="relative"/>
					</span>
					<span v-if="effectiveMinRequiredVersion" :class="$style.metaPill">
						<i class="ti ti-shield-check"></i>
						{{ i18n.tsx.appDownloadMinRequiredVersion({ version: effectiveMinRequiredVersion }) }}
					</span>
					<a
						v-if="repoUrl"
						:href="repoUrl"
						target="_blank"
						rel="noopener noreferrer"
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
					<span><b>{{ i18n.ts.appDownloadDesktopNoticeTitle }}</b> · {{ i18n.ts.appDownloadDesktopNoticeBody }}</span>
				</MkInfo>

				<FormSection :class="$style.sectionBlock">
					<template #label>{{ i18n.ts.download }}</template>
					<div :class="[$style.sectionBody, $style.downloadStack]">
						<div v-if="availableCards.length > 0" :class="$style.downloadGrid">
							<article
								v-for="card in availableCards"
								:key="card.platform"
								class="_panel"
								:class="[$style.card, { [$style.cardSpotlight]: card.isSpotlight }]"
							>
								<div :class="$style.cardInfo">
									<div :class="$style.cardHead">
										<div :class="$style.platformWrap">
											<span :class="$style.platformIcon">
												<i :class="card.icon"></i>
											</span>
											<div :class="$style.platformTitleBlock">
												<div :class="$style.platformNameRow">
													<span :class="$style.platform">{{ card.label }}</span>
													<span v-if="card.version" class="_monospace" :class="$style.versionPill">v{{ card.version }}</span>
													<span v-if="card.isRecommended" :class="$style.recommendedBadge">
														{{ i18n.ts.appDownloadRecommendedForDevice }}
													</span>
												</div>
												<div v-if="card.publishedDate" :class="$style.publishedLine">
													<i class="ti ti-calendar"></i>
													<span>{{ i18n.tsx.appDownloadReleaseDate({ date: card.publishedDate }) }}</span>
												</div>
											</div>
										</div>
									</div>

									<div v-if="card.hasMeta" :class="$style.specPills">
										<span v-if="card.assetName" class="_monospace _selectable" :class="$style.specPill">
											<i class="ti ti-package"></i>
											{{ card.assetName }}
										</span>
										<span v-if="card.sizeText" class="_monospace" :class="$style.specPill">
											<i class="ti ti-file-zip"></i>
											{{ card.sizeText }}
										</span>
										<span v-if="card.downloadCountText" class="_monospace" :class="$style.specPill">
											<i class="ti ti-download"></i>
											{{ card.downloadCountText }}
										</span>
										<button
											v-if="card.sha256"
											type="button"
											class="_button"
											:class="$style.shaPill"
											:aria-label="i18n.ts.appDownloadCopySha256"
											:title="`${i18n.ts.appDownloadSha256}: ${card.sha256}`"
											@click="copyToClipboard(card.sha256)"
										>
											<span class="_monospace">SHA-256 {{ card.sha256Short }}</span>
											<i class="ti ti-copy"></i>
										</button>
									</div>
								</div>

								<div :class="$style.cardActions">
									<MkButton primary rounded full :disabled="!card.canDownload" @click="openExternal(card.downloadUrl)">
										<i class="ti ti-download"></i>
										{{ card.canDownload ? i18n.ts.download : temporaryUnavailableText }}
									</MkButton>
									<div v-if="card.canOpenRelease || card.canDownload" :class="$style.secondaryActions">
										<a
											v-if="card.canOpenRelease"
											:href="card.releaseUrl"
											target="_blank"
											rel="noopener noreferrer"
											:class="$style.secondaryLink"
										>
											<i class="ti ti-brand-github"></i>
											{{ i18n.ts.appDownloadViewRelease }}
										</a>
										<button
											v-if="card.canDownload"
											type="button"
											class="_button"
											:class="$style.copyUrlBtn"
											:aria-label="card.downloadUrl"
											:title="card.downloadUrl"
											@click="copyToClipboard(card.downloadUrl)"
										>
											<i class="ti ti-link"></i>
										</button>
									</div>
								</div>
							</article>
						</div>

						<div v-if="unavailableCards.length > 0" :class="$style.unavailableList">
							<div
								v-for="card in unavailableCards"
								:key="card.platform"
								:class="$style.unavailableStrip"
							>
								<div :class="$style.unavailablePlatform">
									<i :class="card.icon"></i>
									<span>{{ card.label }}</span>
								</div>
								<span :class="$style.unavailableStatus">{{ temporaryUnavailableText }}</span>
							</div>
						</div>
					</div>
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
	platform: 'android' | 'ios';
	label: string;
	icon: string;
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
	isAvailable: boolean;
	isRecommended: boolean;
	isSpotlight: boolean;
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
	platform: 'android' | 'ios',
	label: string,
	icon: string,
	latest: AppLatestPlatform | null | undefined,
	fallbackVersion: string | undefined,
	fallbackUrl: string | undefined,
): Omit<PlatformCardView, 'isSpotlight'> {
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
	const canDownload = isSafeHttpUrl(downloadUrl);

	return {
		platform,
		label,
		icon,
		version,
		publishedDate,
		assetName,
		sizeText,
		downloadCountText,
		sha256,
		sha256Short,
		downloadUrl,
		canDownload,
		releaseUrl,
		canOpenRelease: isSafeHttpUrl(releaseUrl),
		hasMeta: Boolean(assetName || sizeText || downloadCountText || sha256),
		isAvailable: canDownload || version.length > 0,
		isRecommended: clientPlatform === platform,
	};
}

const platformCards = computed<PlatformCardView[]>(() => {
	const base = [
		buildPlatformCard(
			'android',
			i18n.ts.appClientPlatformAndroid,
			'ti ti-brand-android',
			releasesData.value?.latest?.android,
			appInfo.value.latestAndroidVersion,
			appInfo.value.androidDownloadUrl,
		),
		buildPlatformCard(
			'ios',
			i18n.ts.appClientPlatformIos,
			'ti ti-brand-apple',
			releasesData.value?.latest?.ios,
			appInfo.value.latestIosVersion,
			appInfo.value.iosDownloadUrl,
		),
	];

	const availableCount = base.filter(c => c.isAvailable).length;
	const sorted = [...base].sort((a, b) => Number(b.isRecommended) - Number(a.isRecommended));
	return sorted.map(card => ({
		...card,
		isSpotlight: card.isAvailable && (availableCount === 1 || card.isRecommended),
	}));
});

const availableCards = computed(() => platformCards.value.filter(c => c.isAvailable));
const unavailableCards = computed(() => platformCards.value.filter(c => !c.isAvailable));

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
	display: flex;
	flex-direction: column;
	gap: 20px;
	padding-top: 8px;
	padding-bottom: 16px;
}

.sectionBlock {
	margin-top: 0;
}

.sectionBody {
	margin-top: 12px;
}

.hero {
	padding: 22px 24px;
	background:
		radial-gradient(ellipse 80% 90% at 0% 0%, color-mix(in srgb, var(--MI_THEME-accent), transparent 82%), transparent 60%),
		var(--MI_THEME-panel);
	border: 1px solid color-mix(in srgb, var(--MI_THEME-accent), transparent 76%);
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
	font-size: 0.8rem;
	padding: 4px 11px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-weight: 700;
}

.heroTitle {
	font-size: 1.85rem;
	font-weight: 800;
	letter-spacing: -0.01em;
}

.heroSub {
	margin-top: 6px;
	opacity: 0.82;
	line-height: 1.55;
	white-space: pre-wrap;
}

.heroMeta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-top: 10px;
	font-size: 0.82rem;
}

.metaPill {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 4px 10px;
	border-radius: 999px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
	opacity: 0.88;
}

.repoLink {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	margin-left: auto;
	padding: 4px 11px;
	border-radius: 999px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-weight: 600;
	text-decoration: none;
	transition: opacity 0.15s ease;

	&:hover {
		opacity: 0.85;
	}
}

.downloadStack {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.downloadGrid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 14px;
}

.card {
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	gap: 18px;
	padding: 20px 22px;
	border: 1px solid var(--MI_THEME-divider);
	transition: border-color 0.2s ease;
}

.cardSpotlight {
	grid-column: 1 / -1;
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(220px, 260px);
	align-items: center;
	gap: 20px 28px;
	padding: 24px;
	border-color: color-mix(in srgb, var(--MI_THEME-accent), transparent 45%);
	background:
		radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--MI_THEME-accent), transparent 86%), transparent 55%),
		var(--MI_THEME-panel);
}

.cardInfo {
	display: flex;
	flex-direction: column;
	gap: 14px;
	min-width: 0;
}

.cardHead {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
}

.platformWrap {
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
}

.platformIcon {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 44px;
	height: 44px;
	flex-shrink: 0;
	border-radius: 12px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 1.4rem;
}

.platformTitleBlock {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.platformNameRow {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.platform {
	font-size: 1.15rem;
	font-weight: 800;
}

.versionPill {
	padding: 2px 9px;
	border-radius: 999px;
	font-size: 0.82rem;
	font-weight: 700;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
}

.recommendedBadge {
	padding: 2px 9px;
	border-radius: 999px;
	font-size: 0.76rem;
	font-weight: 700;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.publishedLine {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	font-size: 0.83rem;
	opacity: 0.68;
}

.specPills {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.specPill,
.shaPill {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 5px 10px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
	font-size: 0.8rem;
	line-height: 1.3;
	max-width: 100%;
	overflow-wrap: anywhere;
}

.shaPill {
	color: inherit;
	transition: border-color 0.15s ease, color 0.15s ease;

	> i {
		color: var(--MI_THEME-accent);
	}

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}

.cardActions {
	display: flex;
	flex-direction: column;
	gap: 10px;
	width: 100%;
}

.secondaryActions {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
}

.secondaryLink {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding: 6px 12px;
	border-radius: 999px;
	font-size: 0.83rem;
	font-weight: 600;
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
	text-decoration: none;
	transition: border-color 0.15s ease, color 0.15s ease;

	&:hover {
		border-color: var(--MI_THEME-accent);
		color: var(--MI_THEME-accent);
	}
}

.copyUrlBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 999px;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
	color: var(--MI_THEME-fg);
	opacity: 0.78;
	transition: border-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;

	&:hover {
		border-color: var(--MI_THEME-accent);
		color: var(--MI_THEME-accent);
		opacity: 1;
	}
}

.unavailableList {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.unavailableStrip {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 16px;
	border-radius: var(--MI-radius);
	border: 1px dashed var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel), transparent 40%);
}

.unavailablePlatform {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-weight: 600;
	opacity: 0.72;
}

.unavailableStatus {
	padding: 2px 10px;
	border-radius: 999px;
	font-size: 0.78rem;
	background: var(--MI_THEME-bg);
	border: 1px solid var(--MI_THEME-divider);
	opacity: 0.65;
}

@media (max-width: 700px) {
	.downloadGrid {
		grid-template-columns: 1fr;
	}

	.cardSpotlight {
		grid-template-columns: 1fr;
		padding: 20px;
	}
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
	padding: 18px 22px;
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
	font-size: 1.2rem;
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
	padding-left: 0;
	list-style: none;
	line-height: 1.65;

	> li {
		position: relative;
		padding-left: 16px;
	}

	> li::before {
		content: '';
		position: absolute;
		left: 2px;
		top: 0.85em;
		width: 6px;
		height: 1.5px;
		border-radius: 1px;
		background: currentColor;
		opacity: 0.45;
	}

	> li + li {
		margin-top: 4px;
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
