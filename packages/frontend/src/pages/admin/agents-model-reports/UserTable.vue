<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps_s">
	<MkResult v-if="items.length === 0" type="empty" text="该范围内没有用户调用"/>
	<template v-else>
		<div :class="$style.table">
			<div :class="$style.head">
				<span>#</span>
				<span>用户</span>
				<button
					v-for="c in COLUMNS"
					:key="c.key"
					type="button"
					class="_button"
					:class="[$style.sortBtn, c.sort != null && sort === c.sort ? $style.sortBtnOn : null]"
					:disabled="c.sort == null"
					@click="c.sort != null && emit('update:sort', c.sort)"
				>
					{{ c.label }}<i v-if="c.sort != null && sort === c.sort" class="ti ti-arrow-down"></i>
				</button>
			</div>
			<div
				v-for="(u, idx) in items"
				:key="u.userId"
				:class="$style.row"
				role="button"
				tabindex="0"
				@click="openUser(u.userId)"
				@keydown.enter="openUser(u.userId)"
			>
				<span :class="$style.rank">{{ (page - 1) * pageSize + idx + 1 }}</span>
				<span :class="$style.user">
					<template v-if="u.user != null">
						<MkAvatar :user="u.user" :class="$style.avatar" indicator/>
						<MkUserName :user="u.user" :nowrap="true"/>
						<small :class="$style.muted">@{{ u.user.username }}</small>
					</template>
					<span v-else :class="$style.muted">已注销用户</span>
				</span>
				<span v-for="c in COLUMNS" :key="c.key" :class="c.key === 'failed' && u.m.failed > 0 ? $style.bad : null">{{ c.fmt(u.m) }}</span>
			</div>
		</div>
		<div :class="$style.pagerBar">
			<div :class="$style.pageSizes">
				<button
					v-for="size in PAGE_SIZES"
					:key="size"
					type="button"
					class="_button"
					:class="[$style.pagerSizeBtn, pageSize === size ? $style.pagerSizeBtnActive : null]"
					@click="emit('update:pageSize', size)"
				>
					{{ size }}
				</button>
			</div>
			<button type="button" class="_button" :class="$style.pagerNavBtn" :disabled="page <= 1 || loading" @click="emit('update:page', page - 1)"><i class="ti ti-chevron-left"></i></button>
			<span :class="$style.pagerText">{{ page }} / {{ totalPages }}</span>
			<button type="button" class="_button" :class="$style.pagerNavBtn" :disabled="page >= totalPages || loading" @click="emit('update:page', page + 1)"><i class="ti ti-chevron-right"></i></button>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import type { ReportMetrics, UserSort } from '@/components/agent-report/report-utils.js';
import { fmtCompact, fmtCredits, fmtInt, fmtPct, successRate, totalTokens } from '@/components/agent-report/report-utils.js';
import { useRouter } from '@/router.js';

const props = defineProps<{
	items: { userId: string; user: Misskey.entities.UserLite | null; m: ReportMetrics }[];
	total: number;
	page: number;
	pageSize: number;
	sort: UserSort;
	loading: boolean;
}>();

const emit = defineEmits<{
	(ev: 'update:page', v: number): void;
	(ev: 'update:pageSize', v: number): void;
	(ev: 'update:sort', v: UserSort): void;
}>();

const router = useRouter();

const PAGE_SIZES = [10, 20, 50];

const COLUMNS: { key: string; label: string; sort: UserSort | null; fmt: (m: ReportMetrics) => string }[] = [
	{ key: 'credits', label: '扣费', sort: 'credits', fmt: m => fmtCredits(m.credits) },
	{ key: 'total', label: '请求', sort: 'total', fmt: m => fmtInt(m.total) },
	{ key: 'tokens', label: 'Token', sort: 'tokens', fmt: m => fmtCompact(totalTokens(m)) },
	{ key: 'failed', label: '失败', sort: 'failed', fmt: m => fmtInt(m.failed) },
	{ key: 'successRate', label: '成功率', sort: null, fmt: m => fmtPct(successRate(m)) },
	{ key: 'free', label: '免费', sort: null, fmt: m => fmtInt(m.freeCalls) },
	{ key: 'paid', label: '付费', sort: null, fmt: m => fmtInt(m.paidCalls) },
];

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

function openUser(userId: string) {
	router.push('/admin/user/:userId', { params: { userId }, hash: 'agentUsage' });
}
</script>

<style lang="scss" module>
.muted {
	opacity: 0.56;
	font-weight: 400;
}

.bad {
	color: var(--MI_THEME-error);
}

.table {
	display: grid;
	grid-template-columns: minmax(max-content, 0.3fr) minmax(max-content, 2.6fr) repeat(7, minmax(max-content, 1fr));
	overflow-x: auto;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 10px;
	font-size: 0.86em;
	font-variant-numeric: tabular-nums;
}

.head,
.row {
	display: contents;

	> * {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		padding: 8px 8px;
		white-space: nowrap;

		@media (pointer: coarse) {
			padding: 10px 8px;
		}
		border-bottom: solid 1px var(--MI_THEME-divider);
	}

	> *:nth-child(-n + 2) {
		justify-content: flex-start;
	}

	> *:first-child {
		padding-left: 14px;
	}

	> *:last-child {
		padding-right: 14px;
	}
}

.head > * {
	font-size: 0.86em;
	font-weight: 600;
	background: var(--MI_THEME-panel);
	opacity: 0.85;
}

.sortBtn {
	gap: 2px;

	&:hover:not(:disabled) {
		color: var(--MI_THEME-accent);
	}

	&:disabled {
		cursor: default;
	}
}

.sortBtnOn {
	color: var(--MI_THEME-accent);
}

.row {
	cursor: pointer;

	&:hover > * {
		background: color-mix(in srgb, var(--MI_THEME-accent) 6%, transparent);
	}

	&:focus-visible > * {
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}

	&:last-child > * {
		border-bottom: none;
	}
}

.rank {
	font-weight: 700;
	opacity: 0.66;
}

.user {
	gap: 8px;
	font-weight: 600;
}

.avatar {
	width: 24px;
	height: 24px;
}

.pagerBar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 4px 0;
}

.pageSizes {
	display: inline-flex;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
}

.pagerSizeBtn {
	min-width: 36px;
	height: 28px;
	padding: 0 8px;
	border-right: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.82em;
	font-weight: 600;
}

.pagerSizeBtn:last-child {
	border-right: none;
}

.pagerSizeBtnActive {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.pagerNavBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: 6px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
}

.pagerNavBtn:disabled {
	opacity: 0.4;
}

.pagerText {
	min-width: 4em;
	font-size: 0.85em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	text-align: center;
}
</style>
