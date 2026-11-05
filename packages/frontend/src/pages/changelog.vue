<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 760px; --MI_SPACER-min: 16px;">
		<div class="_gaps_m">
			<header :class="$style.hero">
				<div :class="$style.heroIcon"><i class="ti ti-sparkles"></i></div>
				<div :class="$style.heroText">
					<h1 :class="$style.heroTitle">{{ instance.name ?? host }} 更新日志</h1>
					<p :class="$style.heroSub">当前版本 <code>{{ version }}</code><template v-if="currentRelease == null">（未收录于更新日志）</template></p>
				</div>
			</header>

			<MkResult v-if="releases.length === 0" type="empty" text="暂无更新日志。"/>

			<template v-else>
				<nav :class="$style.versionNav" aria-label="版本">
					<button
						v-for="r in releases"
						:key="r.version"
						type="button"
						class="_button"
						:class="[$style.versionChip, r.version === version ? $style.versionChipCurrent : null]"
						@click="scrollToRelease(r.version)"
					>
						{{ shortVersion(r) }}
					</button>
				</nav>

				<div :class="$style.timeline">
					<article
						v-for="(r, idx) in visibleReleases"
						:id="anchorId(r.version)"
						:key="r.version"
						:class="[$style.release, r.version === version ? $style.releaseCurrent : null]"
					>
						<span :class="$style.dot" aria-hidden="true"></span>
						<div v-panel :class="$style.card">
							<div :class="$style.cardHead">
								<div :class="$style.cardTitle">
									<b>{{ r.version }}</b>
									<span v-if="r.version === version" :class="$style.currentBadge">当前版本</span>
									<span v-else-if="idx === 0" :class="$style.latestBadge">最新</span>
								</div>
								<a :href="upstreamReleaseUrl(r.baseVersion)" target="_blank" rel="noopener noreferrer" class="_link" :class="$style.baseLink">
									上游 {{ r.baseVersion }} <i class="ti ti-external-link"></i>
								</a>
							</div>
							<p v-for="(note, i) in r.notes" :key="'n' + i" :class="$style.note"><MkInlineMarkdown :text="note"/></p>
							<section v-for="(g, gi) in r.groups" :key="gi" :class="$style.group">
								<h2
									:class="[$style.groupTitle,
										g.kind === 'feature' ? $style.kindFeature
										: g.kind === 'improve' ? $style.kindImprove
										: g.kind === 'change' ? $style.kindChange
										: g.kind === 'fix' ? $style.kindFix
										: $style.kindOther]"
								>
									<i :class="kindIcon(g.kind)"></i>{{ g.title }}<span :class="$style.groupCount">{{ g.items.length }}</span>
								</h2>
								<ul :class="$style.items">
									<li v-for="(item, ii) in g.items" :key="ii" :class="$style.item">
										<span
											v-if="item.kind != null && item.kind !== g.kind"
											:class="[$style.itemTag,
												item.kind === 'feature' ? $style.kindFeature
												: item.kind === 'improve' ? $style.kindImprove
												: item.kind === 'change' ? $style.kindChange
												: item.kind === 'fix' ? $style.kindFix
												: $style.kindOther]"
										>{{ kindLabel(item.kind) }}</span>
										<MkInlineMarkdown :text="item.text"/>
										<ul v-if="item.children.length > 0" :class="$style.children">
											<li v-for="(child, ci) in item.children" :key="ci"><MkInlineMarkdown :text="child"/></li>
										</ul>
									</li>
								</ul>
							</section>
						</div>
					</article>
				</div>

				<div v-if="visibleCount < releases.length" :class="$style.more">
					<MkButton rounded @click="visibleCount = releases.length"><i class="ti ti-chevron-down"></i> 显示更早的 {{ releases.length - visibleCount }} 个版本</MkButton>
				</div>
			</template>

			<div :class="$style.footer">
				<a href="https://misskey-hub.net/docs/releases/" target="_blank" rel="noopener noreferrer" class="_link">查看 Misskey 官方更新日志 <i class="ti ti-external-link"></i></a>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { forkChangelog } from 'virtual:fork-changelog';
import { host, version } from '@@/js/config.js';
import MkButton from '@/components/MkButton.vue';
import MkResult from '@/components/global/MkResult.vue';
import MkInlineMarkdown from '@/components/MkInlineMarkdown.vue';
import { instance } from '@/instance.js';
import { definePage } from '@/page.js';

type Release = typeof forkChangelog[number];
type Kind = Release['groups'][number]['kind'];

const props = defineProps<{
	version?: string;
}>();

const INITIAL_COUNT = 5;
const releases = forkChangelog;
const currentRelease = releases.find(r => r.version === version) ?? null;

// 默认只渲染最近几个版本；定位到更早的版本时一并展开
const targetIndex = releases.findIndex(r => r.version === (props.version ?? version));
const visibleCount = ref(Math.max(INITIAL_COUNT, targetIndex + 1));
const visibleReleases = computed(() => releases.slice(0, visibleCount.value));

function anchorId(v: string): string {
	return `release-${v.replace(/[^0-9A-Za-z]+/g, '-')}`;
}

function shortVersion(r: Release): string {
	return `${r.baseVersion} · ${r.forkRevision}`;
}

function upstreamReleaseUrl(base: string): string {
	return `https://misskey-hub.net/docs/releases/#_${base.replace(/\./g, '')}`;
}

function kindIcon(kind: Kind): string {
	switch (kind) {
		case 'feature': return 'ti ti-sparkles';
		case 'improve': return 'ti ti-trending-up';
		case 'change': return 'ti ti-adjustments';
		case 'fix': return 'ti ti-tool';
		default: return 'ti ti-notes';
	}
}

function kindLabel(kind: Kind): string {
	switch (kind) {
		case 'feature': return '新增';
		case 'improve': return '优化';
		case 'change': return '调整';
		case 'fix': return '修复';
		default: return '其他';
	}
}

async function scrollToRelease(v: string) {
	const index = releases.findIndex(r => r.version === v);
	if (index >= visibleCount.value) visibleCount.value = index + 1;
	await nextTick();
	window.document.getElementById(anchorId(v))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

onMounted(() => {
	if (props.version != null && releases.some(r => r.version === props.version)) void scrollToRelease(props.version);
});

definePage(() => ({
	title: '更新日志',
	icon: 'ti ti-sparkles',
}));
</script>

<style lang="scss" module>
.hero {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 4px 2px;
}

.heroIcon {
	display: grid;
	place-items: center;
	flex-shrink: 0;
	width: 48px;
	height: 48px;
	border-radius: 14px;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-size: 1.5em;
}

.heroText {
	min-width: 0;
}

.heroTitle {
	margin: 0;
	font-size: 1.25em;
}

.heroSub {
	margin: 4px 0 0;
	font-size: 0.88em;
	opacity: 0.75;

	> code {
		padding: 0.1em 0.4em;
		border-radius: 4px;
		background: var(--MI_THEME-panel);
	}
}

.versionNav {
	display: flex;
	gap: 6px;
	overflow-x: auto;
	padding-bottom: 4px;
	scrollbar-width: thin;
}

.versionChip {
	flex-shrink: 0;
	padding: 4px 12px;
	border-radius: 999px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	font-size: 0.82em;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;

	&:hover {
		border-color: var(--MI_THEME-accent);
	}
}

.versionChipCurrent {
	border-color: var(--MI_THEME-accent);
	color: var(--MI_THEME-accent);
	font-weight: bold;
}

.timeline {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding-left: 22px;

	&::before {
		content: '';
		position: absolute;
		top: 8px;
		bottom: 8px;
		left: 6px;
		width: 2px;
		border-radius: 1px;
		background: var(--MI_THEME-divider);
	}
}

.release {
	position: relative;
	scroll-margin-top: 72px;
}

.dot {
	position: absolute;
	top: 20px;
	left: -21px;
	width: 12px;
	height: 12px;
	border-radius: 50%;
	background: var(--MI_THEME-panel);
	border: 2px solid var(--MI_THEME-divider);
	box-sizing: border-box;
}

.releaseCurrent .dot {
	background: var(--MI_THEME-accent);
	border-color: var(--MI_THEME-accent);
}

.card {
	padding: 16px 18px;
	border-radius: 12px;
	min-width: 0;
}

.releaseCurrent .card {
	box-shadow: 0 0 0 1px var(--MI_THEME-accent);
}

.cardHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 6px 12px;
}

.cardTitle {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	font-size: 1.05em;
	overflow-wrap: anywhere;
}

.currentBadge,
.latestBadge {
	flex-shrink: 0;
	padding: 1px 8px;
	border-radius: 999px;
	font-size: 0.72em;
	font-weight: normal;
}

.currentBadge {
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
}

.latestBadge {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.baseLink {
	font-size: 0.8em;
	white-space: nowrap;
}

.note {
	margin: 10px 0 0;
	font-size: 0.92em;
	line-height: 1.6;
	opacity: 0.85;
}

.group {
	margin-top: 14px;
}

.groupTitle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin: 0 0 6px;
	padding: 2px 10px;
	border-radius: 999px;
	font-size: 0.82em;
}

.groupCount {
	opacity: 0.7;
	font-variant-numeric: tabular-nums;
}

.kindFeature {
	background: color-mix(in srgb, var(--MI_THEME-accent) 16%, transparent);
	color: var(--MI_THEME-accent);
}

.kindImprove {
	background: color-mix(in srgb, #3b82f6 16%, transparent);
	color: #3b82f6;
}

.kindChange {
	background: color-mix(in srgb, var(--MI_THEME-warn) 18%, transparent);
	color: var(--MI_THEME-warn);
}

.kindFix {
	background: color-mix(in srgb, var(--MI_THEME-success) 16%, transparent);
	color: var(--MI_THEME-success);
}

.kindOther {
	background: color-mix(in srgb, var(--MI_THEME-fg) 8%, transparent);
	color: var(--MI_THEME-fg);
}

.items {
	margin: 0;
	padding-left: 1.2em;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.item {
	font-size: 0.92em;
	line-height: 1.65;
	overflow-wrap: anywhere;
}

.itemTag {
	display: inline-block;
	margin-right: 6px;
	padding: 0 6px;
	border-radius: 4px;
	font-size: 0.78em;
	line-height: 1.7;
	vertical-align: 1px;
}

.children {
	margin: 4px 0 0;
	padding-left: 1.2em;
	font-size: 0.95em;
	opacity: 0.85;
}

.more,
.footer {
	display: flex;
	justify-content: center;
}

.footer {
	font-size: 0.88em;
	opacity: 0.85;
}

@media (max-width: 500px) {
	.timeline {
		padding-left: 16px;
	}

	.dot {
		left: -15px;
	}

	.card {
		padding: 14px;
	}
}
</style>
