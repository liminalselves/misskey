<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="['_gaps_m', $style.page]">
	<MkLoading v-if="loading"/>
	<template v-else-if="summary">
		<div :class="$style.summary">
			<div :class="[$style.card, $style.cardBalance]">
				<div :class="$style.cardIcon"><i class="ti ti-wallet"></i></div>
				<div :class="$style.cardBody">
					<div :class="$style.cardValue"><MkNumber :value="summary.creditBalance" :tween="false"/></div>
					<div :class="$style.cardLabel">{{ i18n.ts._agents.myStatsCreditBalance }}</div>
				</div>
			</div>
			<div :class="[$style.card, $style.cardRequests]">
				<div :class="$style.cardIcon"><i class="ti ti-send"></i></div>
				<div :class="$style.cardBody">
					<div :class="$style.cardValue"><MkNumber :value="overallTotal"/></div>
					<div :class="$style.cardLabel">{{ i18n.ts._agents.totalRequest }}</div>
				</div>
			</div>
			<div :class="[$style.card, $style.cardRate]">
				<div :class="$style.cardIcon"><i class="ti ti-circle-check"></i></div>
				<div :class="$style.cardBody">
					<div :class="$style.cardValue">{{ overallTotal > 0 ? ((overallSuccess / overallTotal) * 100).toFixed(1) + '%' : '—' }}</div>
					<div :class="$style.cardLabel">{{ i18n.ts._agents.successRate }}</div>
				</div>
			</div>
			<div :class="[$style.card, $style.cardCost]">
				<div :class="$style.cardIcon"><i class="ti ti-coin"></i></div>
				<div :class="$style.cardBody">
					<div :class="$style.cardValue">{{ overallCost.toFixed(4) }}</div>
					<div :class="$style.cardLabel">{{ i18n.ts._agents.myStatsCost }}</div>
				</div>
			</div>
		</div>

		<!-- 兑换卡密 -->
		<div :class="$style.redeemSection">
			<div :class="$style.redeemRow">
				<MkInput v-model="redeemCode" type="text" :class="$style.redeemInput" autocomplete="off">
					<template #label>{{ i18n.ts._agents.redeemCodeInput }}</template>
				</MkInput>
				<MkButton primary rounded :disabled="redeeming || !redeemCode.trim()" @click="redeem">
					<i class="ti ti-ticket"></i> {{ i18n.ts._agents.redeemCodeSubmit }}
				</MkButton>
			</div>
		</div>

		<!-- 消费日志 -->
		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-receipt"></i></template>
			<template #label>{{ i18n.ts._agents.billingLog }}</template>
			<MkLoading v-if="billingLoading"/>
			<MkInfo v-else-if="billingItems.length === 0">{{ i18n.ts._agents.myStatsNoLogs }}</MkInfo>
			<template v-else>
				<div :class="$style.table">
					<div :class="[$style.row, $style.headRow, $style.billingCols]">
						<span>{{ i18n.ts._agents.myStatsTime }}</span>
						<span>{{ i18n.ts._agents.billingType }}</span>
						<span>{{ i18n.ts._agents.billingDetail }}</span>
						<span :class="$style.num">{{ i18n.ts._agents.billingAmount }}</span>
					</div>
					<div v-for="item in billingItems" :key="item.id" :class="[$style.row, $style.rowData, $style.billingCols]">
						<span :class="$style.name">{{ toBJT(item.createdAt) }}</span>
						<span :class="$style.billingTypeCell">
							<span
								v-if="item.kind === 'usage'"
								:class="[$style.billingStatusChip, item.status === 'success' ? $style.badgeOk : item.status === 'failed' ? $style.badgeErr : $style.badgeWarn]"
								:title="billingUsageRowTitle(item.status)"
							>
								<span :class="$style.billingStatusPrefix">{{ billingUsageSubkindLabel(item) }}</span>
								<span :class="$style.billingStatusSep" aria-hidden="true">·</span>
								<span :class="$style.billingStatusValue">{{ billingUsageRowStatus(item.status) }}</span>
							</span>
							<span v-else :class="[$style.badge, $style.badgeRedeem, $style.billingRedeemChip]">
								<i class="ti ti-ticket" :class="$style.billingRedeemIcon" aria-hidden="true"/>
								{{ i18n.ts._agents.billingKindRedeem }}
							</span>
						</span>
						<span :class="$style.name">{{ item.kind === 'usage' ? (item.modelName ?? '—') : (item.redeemCode ?? '') }}</span>
						<span :class="[$style.num, item.kind === 'usage' ? $style.colorErr : $style.colorOk]">{{ formatBillingAmount(item) }}</span>
					</div>
				</div>
				<div :class="$style.pagerBar" role="navigation" :aria-label="i18n.ts._agents.billingLog">
					<div :class="$style.pagerSegGroup" :aria-label="i18n.ts._agents.pageSize" role="group">
						<button
							v-for="size in pageSizeOptions"
							:key="`b-${size}`"
							type="button"
							class="_button"
							:class="[$style.pagerSegBtn, billingPageSize === size ? $style.pagerSegBtnActive : null]"
							@click="billingPageSize = size"
						>{{ size }}</button>
					</div>
					<div :class="$style.pagerNavGroup" role="group">
						<button
							type="button"
							class="_button"
							:class="$style.pagerNavIconBtn"
							:disabled="billingPage <= 1 || billingLoading"
							:aria-label="i18n.ts._agents.sessionMemoryPrevPage"
							@click="goBillingPage(billingPage - 1)"
						>
							<i class="ti ti-chevron-left" aria-hidden="true"/>
						</button>
						<span :class="$style.pagerNavText">{{ billingPage }} / {{ billingTotalPages }}</span>
						<button
							type="button"
							class="_button"
							:class="$style.pagerNavIconBtn"
							:disabled="billingPage >= billingTotalPages || billingLoading"
							:aria-label="i18n.ts._agents.sessionMemoryNextPage"
							@click="goBillingPage(billingPage + 1)"
						>
							<i class="ti ti-chevron-right" aria-hidden="true"/>
						</button>
					</div>
					<div :class="$style.pagerGoGroup" role="group" :aria-label="i18n.ts._agents.pageJump">
						<div :class="$style.pagerGoInputCell">
							<input
								type="number"
								inputmode="numeric"
								:min="1"
								:max="billingTotalPages"
								:value="billingPageInput"
								:disabled="billingLoading"
								:class="$style.pagerGoNativeInput"
								:aria-label="i18n.ts._agents.pageJump"
								@input="syncBillingPagerInput"
								@keydown.enter.prevent="goBillingInputPage"
							/>
						</div>
						<button
							type="button"
							class="_button"
							:class="$style.pagerGoJumpBtn"
							:disabled="billingLoading"
							@click="goBillingInputPage"
						>{{ i18n.ts._agents.pageJump }}</button>
					</div>
				</div>
			</template>
		</MkFolder>

		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-chart-bar"></i></template>
			<template #label>{{ i18n.ts._agents.myStatsModelStats }}</template>
			<MkInfo v-if="summary.modelStats.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
			<div v-else :class="$style.table">
				<div :class="[$style.row, $style.headRow, $style.modelCols]">
					<span>{{ i18n.ts._agents.myStatsModel }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.myStatsStatusSuccess }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.myStatsStatusFailed }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.myStatsStatusAborted }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.successRate }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.myStatsCost }}</span>
				</div>
				<div v-for="ms in summary.modelStats" :key="ms.modelId ?? '__null__'" :class="[$style.row, $style.rowData, $style.modelCols]">
					<span :class="$style.name" :title="ms.modelName ?? undefined">{{ ms.modelName ?? '—' }}</span>
					<span :class="[$style.num, $style.colorOk]">{{ ms.success }}</span>
					<span :class="[$style.num, ms.failed > 0 ? $style.colorErr : null]">{{ ms.failed }}</span>
					<span :class="[$style.num, ms.aborted > 0 ? $style.colorWarn : null]">{{ ms.aborted }}</span>
					<span :class="$style.num">{{ ms.total > 0 ? ((ms.success / ms.total) * 100).toFixed(1) + '%' : '—' }}</span>
					<span :class="$style.num">{{ ms.totalCost.toFixed(4) }}</span>
				</div>
			</div>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-history"></i></template>
			<template #label>{{ i18n.ts._agents.myStatsRecentLogs }}</template>
			<MkInfo v-if="summary.recentLogs.length === 0">{{ i18n.ts._agents.myStatsNoLogs }}</MkInfo>
			<template v-else>
				<div :class="$style.table">
					<div :class="[$style.row, $style.headRow, $style.logCols]">
						<span>{{ i18n.ts._agents.myStatsTime }}</span>
						<span>{{ i18n.ts._agents.myStatsUsageKind }}</span>
						<span>{{ i18n.ts._agents.myStatsModel }}</span>
						<span :class="$style.num">{{ i18n.ts._agents.myStatsStatus }}</span>
						<span :class="$style.num">{{ i18n.ts._agents.myStatsDuration }}</span>
						<span :class="$style.num">{{ i18n.ts._agents.myStatsCost }}</span>
					</div>
					<div v-for="log in summary.recentLogs" :key="log.id" :class="[$style.row, $style.rowData, $style.logCols]">
						<span :class="$style.name">{{ toBJT(log.requestedAt) }}</span>
						<span :class="$style.name">{{ usageLogKindLabel(log.usageKind) }}</span>
						<span :class="$style.name" :title="log.modelName ?? undefined">{{ log.modelName ?? '—' }}</span>
						<span :class="$style.num">
							<span :class="[$style.badge, log.status === 'success' ? $style.badgeOk : log.status === 'failed' ? $style.badgeErr : $style.badgeWarn]">{{ statusLabel(log.status) }}</span>
						</span>
						<span :class="$style.num">{{ log.durationMs != null ? (log.durationMs / 1000).toFixed(1) + 's' : '—' }}</span>
						<span :class="$style.num">{{ log.cost.toFixed(4) }}</span>
					</div>
				</div>
				<div :class="$style.pagerBar" role="navigation" :aria-label="i18n.ts._agents.myStatsRecentLogs">
					<div :class="$style.pagerSegGroup" :aria-label="i18n.ts._agents.pageSize" role="group">
						<button
							v-for="size in pageSizeOptions"
							:key="`r-${size}`"
							type="button"
							class="_button"
							:class="[$style.pagerSegBtn, recentLogsPageSize === size ? $style.pagerSegBtnActive : null]"
							@click="recentLogsPageSize = size"
						>{{ size }}</button>
					</div>
					<div :class="$style.pagerNavGroup" role="group">
						<button
							type="button"
							class="_button"
							:class="$style.pagerNavIconBtn"
							:disabled="recentLogsPage <= 1 || recentLogsLoading"
							:aria-label="i18n.ts._agents.sessionMemoryPrevPage"
							@click="goRecentLogsPage(recentLogsPage - 1)"
						>
							<i class="ti ti-chevron-left" aria-hidden="true"/>
						</button>
						<span :class="$style.pagerNavText">{{ recentLogsPage }} / {{ recentLogsTotalPages }}</span>
						<button
							type="button"
							class="_button"
							:class="$style.pagerNavIconBtn"
							:disabled="recentLogsPage >= recentLogsTotalPages || recentLogsLoading"
							:aria-label="i18n.ts._agents.sessionMemoryNextPage"
							@click="goRecentLogsPage(recentLogsPage + 1)"
						>
							<i class="ti ti-chevron-right" aria-hidden="true"/>
						</button>
					</div>
					<div :class="$style.pagerGoGroup" role="group" :aria-label="i18n.ts._agents.pageJump">
						<div :class="$style.pagerGoInputCell">
							<input
								type="number"
								inputmode="numeric"
								:min="1"
								:max="recentLogsTotalPages"
								:value="recentLogsPageInput"
								:disabled="recentLogsLoading"
								:class="$style.pagerGoNativeInput"
								:aria-label="i18n.ts._agents.pageJump"
								@input="syncRecentLogsPagerInput"
								@keydown.enter.prevent="goRecentLogsInputPage"
							/>
						</div>
						<button
							type="button"
							class="_button"
							:class="$style.pagerGoJumpBtn"
							:disabled="recentLogsLoading"
							@click="goRecentLogsInputPage"
						>{{ i18n.ts._agents.pageJump }}</button>
					</div>
				</div>
			</template>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-users"></i></template>
			<template #label>{{ i18n.ts._agents.myStatsCharacterStats }} ({{ summary.characterStatsTotal }})</template>
			<MkInfo v-if="characterStatsItems.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
			<template v-else>
				<div :class="$style.table">
					<div v-for="cs in characterStatsItems" :key="cs.characterId" :class="[$style.row, $style.rowData, $style.simpleCols]">
						<span :class="$style.name">{{ cs.characterName ?? '—' }}</span>
						<span :class="$style.num">{{ cs.total }}</span>
					</div>
				</div>
				<div v-if="characterStatsHasMore" :class="$style.loadMore">
					<MkButton rounded :disabled="characterStatsLoading" @click="loadMoreCharacterStats">{{ i18n.ts.loadMore }}</MkButton>
				</div>
			</template>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-message-cog"></i></template>
			<template #label>{{ i18n.ts._agents.myStatsStyleStats }} ({{ summary.dialogueStyleStatsTotal }})</template>
			<MkInfo v-if="styleStatsItems.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
			<template v-else>
				<div :class="$style.table">
					<div v-for="ds in styleStatsItems" :key="ds.dialogueStyleId" :class="[$style.row, $style.rowData, $style.simpleCols]">
						<span :class="$style.name">{{ ds.dialogueStyleName ?? '—' }}</span>
						<span :class="$style.num">{{ ds.total }}</span>
					</div>
				</div>
				<div v-if="styleStatsHasMore" :class="$style.loadMore">
					<MkButton rounded :disabled="styleStatsLoading" @click="loadMoreStyleStats">{{ i18n.ts.loadMore }}</MkButton>
				</div>
			</template>
		</MkFolder>
	</template>
	<MkInfo v-else-if="!loading">{{ i18n.ts.somethingHappened }}</MkInfo>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkNumber from '@/components/MkNumber.vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

type RecentLog = {
	id: string;
	requestedAt: string;
	completedAt: string | null;
	durationMs: number | null;
	modelId: string | null;
	modelName: string | null;
	modelApiName: string | null;
	usageKind: 'chat' | 'compression';
	status: 'success' | 'failed' | 'aborted';
	cost: number;
	promptTokens: number | null;
	completionTokens: number | null;
};

type CharacterStat = { characterId: string; characterName: string | null; total: number };
type StyleStat = { dialogueStyleId: string; dialogueStyleName: string | null; total: number };

type UsageSummary = {
	creditBalance: number;
	recentLogs: RecentLog[];
	recentLogsHasMore: boolean;
	recentLogsTotal: number;
	recentLogsPage: number;
	recentLogsPageSize: number;
	modelStats: { modelId: string | null; modelName: string | null; total: number; success: number; failed: number; aborted: number; totalCost: number }[];
	characterStats: CharacterStat[];
	characterStatsTotal: number;
	dialogueStyleStats: StyleStat[];
	dialogueStyleStatsTotal: number;
};

type BillingItem = {
	id: string;
	kind: 'usage' | 'redeem';
	createdAt: string;
	amount: number;
	modelName: string | null;
	usageKind: 'chat' | 'compression' | null;
	status: string | null;
	durationMs: number | null;
	redeemCode: string | null;
};
type BillingResponse = {
	items: BillingItem[];
	hasMore: boolean;
	total: number;
	page: number;
	pageSize: number;
};

const PAGE_SIZE = 30;
const pageSizeOptions = [10, 20, 50] as const;

const loading = ref(true);
const summary = ref<UsageSummary | null>(null);

const overallTotal = computed(() => summary.value?.modelStats.reduce((s, m) => s + m.total, 0) ?? 0);
const overallSuccess = computed(() => summary.value?.modelStats.reduce((s, m) => s + m.success, 0) ?? 0);
const overallCost = computed(() => summary.value?.modelStats.reduce((s, m) => s + m.totalCost, 0) ?? 0);

const redeemCode = ref('');
const redeeming = ref(false);

// --- 消费日志 ---
const billingItems = ref<BillingItem[]>([]);
const billingLoading = ref(false);
const billingPage = ref(1);
const billingTotal = ref(0);
const billingPageInput = ref('1');
const billingPageSize = ref<number>(PAGE_SIZE);
const billingTotalPages = computed(() => Math.max(1, Math.ceil(billingTotal.value / billingPageSize.value)));

async function loadBilling(page = 1) {
	billingLoading.value = true;
	try {
		const res = await misskeyApi('agents/billing-logs' as any, {
			limit: billingPageSize.value,
			page,
			pageSize: billingPageSize.value,
		}) as BillingResponse;
		billingItems.value = res.items;
		billingTotal.value = res.total;
		billingPage.value = res.page;
		billingPageSize.value = Math.max(1, res.pageSize ?? billingPageSize.value);
		billingPageInput.value = String(res.page);
	} finally {
		billingLoading.value = false;
	}
}

// --- 最近请求记录分页 ---
const recentLogsPage = ref(1);
const recentLogsTotal = ref(0);
const recentLogsLoading = ref(false);
const recentLogsPageInput = ref('1');
const recentLogsPageSize = ref<number>(PAGE_SIZE);
const recentLogsTotalPages = computed(() => Math.max(1, Math.ceil(recentLogsTotal.value / recentLogsPageSize.value)));

async function loadRecentLogs(page = 1) {
	recentLogsLoading.value = true;
	try {
		const res = await misskeyApi('agents/my-usage-summary' as any, {
			limit: recentLogsPageSize.value,
			recentLogsPage: page,
			recentLogsPageSize: recentLogsPageSize.value,
		}) as UsageSummary;
		if (summary.value) {
			summary.value.recentLogs = res.recentLogs;
		}
		recentLogsPage.value = res.recentLogsPage;
		recentLogsTotal.value = res.recentLogsTotal;
		recentLogsPageSize.value = Math.max(1, res.recentLogsPageSize ?? recentLogsPageSize.value);
		recentLogsPageInput.value = String(res.recentLogsPage);
	} finally {
		recentLogsLoading.value = false;
	}
}

function syncBillingPagerInput(ev: Event) {
	billingPageInput.value = (ev.target as HTMLInputElement).value;
}

function syncRecentLogsPagerInput(ev: Event) {
	recentLogsPageInput.value = (ev.target as HTMLInputElement).value;
}

function goBillingPage(page: number) {
	const p = Math.min(Math.max(1, page), billingTotalPages.value);
	loadBilling(p);
}

function goBillingInputPage() {
	const p = Number(billingPageInput.value);
	if (!Number.isFinite(p)) return;
	goBillingPage(Math.trunc(p));
}

function goRecentLogsPage(page: number) {
	const p = Math.min(Math.max(1, page), recentLogsTotalPages.value);
	loadRecentLogs(p);
}

function goRecentLogsInputPage() {
	const p = Number(recentLogsPageInput.value);
	if (!Number.isFinite(p)) return;
	goRecentLogsPage(Math.trunc(p));
}

watch(billingPageSize, () => {
	billingPage.value = 1;
	billingPageInput.value = '1';
	loadBilling(1);
});

watch(recentLogsPageSize, () => {
	recentLogsPage.value = 1;
	recentLogsPageInput.value = '1';
	loadRecentLogs(1);
});

// --- 角色统计分页 ---
const characterStatsItems = ref<CharacterStat[]>([]);
const characterStatsHasMore = computed(() =>
	characterStatsItems.value.length < (summary.value?.characterStatsTotal ?? 0),
);
const characterStatsLoading = ref(false);

async function loadMoreCharacterStats() {
	characterStatsLoading.value = true;
	try {
		const res = await misskeyApi('agents/my-usage-summary' as any, {
			limit: 1,
			characterStatsOffset: characterStatsItems.value.length,
			characterStatsLimit: 10,
		}) as UsageSummary;
		characterStatsItems.value.push(...res.characterStats);
	} finally {
		characterStatsLoading.value = false;
	}
}

// --- 风格统计分页 ---
const styleStatsItems = ref<StyleStat[]>([]);
const styleStatsHasMore = computed(() =>
	styleStatsItems.value.length < (summary.value?.dialogueStyleStatsTotal ?? 0),
);
const styleStatsLoading = ref(false);

async function loadMoreStyleStats() {
	styleStatsLoading.value = true;
	try {
		const res = await misskeyApi('agents/my-usage-summary' as any, {
			limit: 1,
			dialogueStyleStatsOffset: styleStatsItems.value.length,
			dialogueStyleStatsLimit: 10,
		}) as UsageSummary;
		styleStatsItems.value.push(...res.dialogueStyleStats);
	} finally {
		styleStatsLoading.value = false;
	}
}

async function redeem() {
	const code = redeemCode.value.trim();
	if (!code) return;
	redeeming.value = true;
	try {
		const result = await misskeyApi('agents/redeem-code' as any, { code }) as { creditAmount: number; newBalance: number };
		if (summary.value) {
			summary.value.creditBalance = result.newBalance;
		}
		redeemCode.value = '';
		os.toast(i18n.tsx._agents.redeemCodeSuccess({ amount: String(result.creditAmount) }));
		loadBilling(billingPage.value);
	} catch (err: any) {
		const code = err?.code;
		const msg = redeemErrorMessage(code) ?? formatApiError(err);
		os.alert({ type: 'error', text: msg });
	} finally {
		redeeming.value = false;
	}
}

function redeemErrorMessage(code: string | undefined): string | null {
	if (!code) return null;
	const map: Record<string, string> = {
		INVALID_REDEEM_CODE: i18n.ts._agents.redeemErrInvalid,
		REDEEM_CODE_REVOKED: i18n.ts._agents.redeemErrRevoked,
		REDEEM_CODE_ALREADY_USED: i18n.ts._agents.redeemErrUsed,
		REDEEM_CODE_EXPIRED: i18n.ts._agents.redeemErrExpired,
	};
	return map[code] ?? null;
}

function toBJT(iso: string): string {
	const d = new Date(iso);
	return d.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function usageLogKindLabel(usageKind: 'chat' | 'compression' | undefined): string {
	if (usageKind === 'compression') return i18n.ts._agents.usageLogKindCompression;
	return i18n.ts._agents.usageLogKindChat;
}

function statusLabel(status: 'success' | 'failed' | 'aborted'): string {
	if (status === 'success') return i18n.ts._agents.myStatsStatusSuccess;
	if (status === 'failed') return i18n.ts._agents.myStatsStatusFailed;
	return i18n.ts._agents.myStatsStatusAborted;
}

function billingUsageSubkindLabel(item: BillingItem): string {
	if (item.kind !== 'usage') return i18n.ts._agents.billingKindUsage;
	if (item.usageKind === 'compression') return i18n.ts._agents.billingKindCompressionUsage;
	return i18n.ts._agents.billingKindChatUsage;
}

function billingUsageRowStatus(status: string | null | undefined): string {
	if (status === 'success') return i18n.ts._agents.myStatsStatusSuccess;
	if (status === 'failed') return i18n.ts._agents.myStatsStatusFailed;
	if (status === 'aborted') return i18n.ts._agents.billingLogStatusAborted;
	return i18n.ts._agents.billingUsageStatusUnknown;
}

function billingUsageRowTitle(status: string | null | undefined): string {
	if (status === 'success') return i18n.ts._agents.billingUsageTitleSuccess;
	if (status === 'failed') return i18n.ts._agents.billingUsageTitleFailed;
	if (status === 'aborted') return i18n.ts._agents.billingUsageTitleAborted;
	return i18n.ts._agents.billingUsageTitleUnknown;
}

function formatBillingAmount(item: BillingItem): string {
	const abs = Math.abs(item.amount).toFixed(4);
	return item.kind === 'usage' ? `-${abs}` : `+${abs}`;
}

onMounted(async () => {
	try {
		const [summaryRes] = await Promise.all([
			misskeyApi('agents/my-usage-summary' as any, {
				limit: PAGE_SIZE,
				recentLogsPage: 1,
				recentLogsPageSize: PAGE_SIZE,
			}) as Promise<UsageSummary>,
			loadBilling(1),
		]);
		summary.value = summaryRes;
		recentLogsPage.value = summaryRes.recentLogsPage;
		recentLogsTotal.value = summaryRes.recentLogsTotal;
		recentLogsPageInput.value = String(summaryRes.recentLogsPage);
		characterStatsItems.value = summaryRes.characterStats;
		styleStatsItems.value = summaryRes.dialogueStyleStats;
	} finally {
		loading.value = false;
	}
});
</script>

<style lang="scss" module>
.page {
	width: 100%;
	max-width: min(100%, 920px);
	margin-inline: auto;
	padding-bottom: 24px;
}

.summary {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
	gap: 14px;
}

.card {
	display: flex;
	align-items: center;
	gap: 12px;
	box-sizing: border-box;
	padding: 14px;
	border-radius: 12px;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
	box-shadow: 0 1px 0 color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
}

.cardIcon {
	flex-shrink: 0;
	display: grid;
	place-items: center;
	width: 44px;
	height: 44px;
	border-radius: 10px;
	font-size: 1.25em;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.cardBody {
	min-width: 0;
	flex: 1;
}

.cardValue {
	font-size: 1.35em;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	line-height: 1.2;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cardLabel {
	font-size: 0.8em;
	opacity: 0.6;
	margin-top: 2px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cardBalance .cardIcon { background: color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent); color: var(--MI_THEME-accent); }
.cardRequests .cardIcon { background: #0088d726; color: #3d96c1; }
.cardRate .cardIcon { background: #86b30026; color: #86b300; }
.cardCost .cardIcon { background: #e96b0026; color: #d76d00; }

.table {
	display: flex;
	flex-direction: column;
	border-radius: 12px;
	overflow: hidden;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	box-shadow: 0 1px 2px color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
}

.row {
	display: grid;
	padding: 10px 14px;
	align-items: center;
	gap: 8px;
	font-size: 0.9em;

	&:not(:last-child) {
		border-bottom: solid 1px var(--MI_THEME-divider);
	}
}

.headRow {
	padding: 8px 14px;
	font-size: 0.76em;
	font-weight: 600;
	opacity: 0.56;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	background: color-mix(in srgb, var(--MI_THEME-panel) 70%, var(--MI_THEME-divider));
}

.rowData {
	transition: background-color 0.12s ease;

	@media (hover: hover) {
		&:hover {
			background: color-mix(in srgb, var(--MI_THEME-fg) 3.5%, var(--MI_THEME-panel));
		}
	}
}

.billingCols {
	grid-template-columns: 1.6fr 0.7fr 1.5fr 0.8fr;
}

.modelCols {
	grid-template-columns: 2.4fr 0.7fr 0.7fr 0.7fr 0.9fr 1fr;
}

.logCols {
	grid-template-columns: 1.45fr 0.8fr 1.15fr 0.8fr 0.75fr 0.85fr;
}

.simpleCols {
	grid-template-columns: 1fr auto;
	gap: 12px;
}

.name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 500;
}

.num {
	text-align: right;
	font-variant-numeric: tabular-nums;
	overflow: hidden;
	text-overflow: ellipsis;
}

.colorOk { color: var(--MI_THEME-success); }
.colorErr { color: var(--MI_THEME-error); }
.colorWarn { color: var(--MI_THEME-warn); }

.badge {
	display: inline-block;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.82em;
	font-weight: 600;
	line-height: 1.3;
}

.badgeBillingUsage {
	max-width: 100%;
	white-space: normal;
	word-break: break-word;
}

.badgeOk {
	color: var(--MI_THEME-success);
	background: color-mix(in srgb, var(--MI_THEME-success) 18%, transparent);
}

.badgeErr {
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 18%, transparent);
}

.badgeWarn {
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 18%, transparent);
}

.badgeRedeem {
	color: #3da2ff;
	background: #3da2ff26;
}

.billingTypeCell {
	display: flex;
	align-items: center;
	min-width: 0;
}

.billingStatusChip {
	display: inline-flex;
	align-items: center;
	gap: 0.15em;
	max-width: 100%;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.82em;
	font-weight: 600;
	line-height: 1.35;
	min-width: 0;
	white-space: nowrap;
}

.billingStatusPrefix {
	font-weight: 500;
}

.billingStatusSep {
	opacity: 0.5;
}

.billingStatusValue {
	font-weight: 700;
}

.billingRedeemChip {
	display: inline-flex;
	align-items: center;
	gap: 0.32em;
	white-space: nowrap;
}

.billingRedeemIcon {
	flex-shrink: 0;
	font-size: 0.95em;
	opacity: 0.92;
}

.loadMore {
	display: flex;
	justify-content: center;
	padding: 14px 0 4px;
}

/*
 * 三盒同尺：外层仅一条描边与中栏对齐；跳转区去掉 MkInput 叠层与本体内框，单行 native input + 与同高按钮
 */
.pagerBar {
	--pgh: 28px;
	--pagerShellPad: 2px;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 8px 10px;
	padding: 10px 0 4px;
	width: 100%;
	box-sizing: border-box;
}

.pagerSegGroup,
.pagerNavGroup,
.pagerGoGroup {
	display: inline-flex;
	align-items: stretch;
	align-self: center;
	box-sizing: border-box;
	max-width: 100%;
	overflow: hidden;
	padding: var(--pagerShellPad);
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
	background: var(--MI_THEME-panel);
	gap: 0;
	flex-wrap: nowrap;
}

.pagerSegBtn {
	min-width: 2.4rem;
	height: var(--pgh);
	max-height: var(--pgh);
	padding: 0 0.5rem;
	border: none;
	border-right: solid 1px var(--MI_THEME-divider);
	background: transparent;
	font-size: 0.82em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
	cursor: pointer;
	line-height: 1;
	box-sizing: border-box;
	flex: none;
}

.pagerSegBtn:last-child {
	border-right: none;
}

.pagerSegBtn:hover:not(:disabled) {
	background: var(--MI_THEME-buttonHoverBg);
}

.pagerSegBtnActive {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.pagerNavIconBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 2.15rem;
	min-width: 2.15rem;
	max-width: 2.15rem;
	height: var(--pgh);
	max-height: var(--pgh);
	padding: 0;
	border: none;
	border-right: solid 1px var(--MI_THEME-divider);
	background: transparent;
	color: var(--MI_THEME-fg);
	font-size: 1.05rem;
	line-height: 1;
	cursor: pointer;
	box-sizing: border-box;
	flex: none;
}

.pagerNavIconBtn:disabled {
	opacity: 0.4;
	cursor: default;
}

.pagerNavIconBtn:hover:not(:disabled) {
	background: var(--MI_THEME-buttonHoverBg);
}

.pagerNavText {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 4.5em;
	height: var(--pgh);
	max-height: var(--pgh);
	padding: 0 0.55rem;
	font-size: 0.84em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fg);
	border-right: solid 1px var(--MI_THEME-divider);
	user-select: none;
	white-space: nowrap;
	flex: none;
	box-sizing: border-box;
	line-height: 1;
}

.pagerNavGroup .pagerNavIconBtn:last-of-type {
	border-right: none;
}

.pagerGoInputCell {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: none;
	min-width: 2.85rem;
	height: var(--pgh);
	max-height: var(--pgh);
	padding: 0 0.42rem;
	border: none;
	border-right: solid 1px var(--MI_THEME-divider);
	background: transparent;
	box-sizing: border-box;
}

.pagerGoNativeInput {
	display: block;
	-moz-appearance: textfield;
	appearance: textfield;
	width: 100%;
	align-self: stretch;
	min-width: 1.85rem;
	max-width: 3.75rem;
	height: 100%;
	min-height: 0;
	margin: 0;
	padding: 0 5px;
	box-sizing: border-box;
	line-height: 1.2;
	font-family: inherit;
	font-size: 0.82em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fg);
	background: transparent;
	border: none;
	outline: none;
	box-shadow: none;
	text-align: center;
}

.pagerGoNativeInput:disabled {
	opacity: 0.45;
	cursor: default;
}

.pagerGoNativeInput::-webkit-outer-spin-button,
.pagerGoNativeInput::-webkit-inner-spin-button {
	-webkit-appearance: none;
	margin: 0;
}

.pagerGoJumpBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: none;
	min-width: 3rem;
	height: var(--pgh);
	max-height: var(--pgh);
	padding: 0 0.52rem;
	margin: 0;
	border: none;
	border-radius: 0;
	background: transparent;
	font-size: 0.82em;
	font-weight: 600;
	font-family: inherit;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
	cursor: pointer;
	line-height: 1;
	box-sizing: border-box;
}

.pagerGoJumpBtn:hover:not(:disabled) {
	background: var(--MI_THEME-buttonHoverBg);
	color: var(--MI_THEME-fg);
}

.pagerGoJumpBtn:disabled {
	opacity: 0.4;
	cursor: default;
}

.pagerGoGroup:focus-within {
	border-color: var(--MI_THEME-accent);
}

@media (max-width: 600px) {
	.billingCols {
		grid-template-columns: 1.2fr 0.7fr 0.8fr;

		> :nth-child(3) {
			display: none;
		}
	}

	.modelCols {
		grid-template-columns: 1.4fr 0.7fr 0.7fr 0.9fr;

		> :nth-child(4),
		> :nth-child(5) {
			display: none;
		}
	}

	.logCols {
		grid-template-columns: 1fr 0.65fr 0.9fr 0.75fr;

		> :nth-child(5),
		> :nth-child(6) {
			display: none;
		}
	}

	.pagerBar {
		gap: 6px 8px;
		padding: 8px 0 4px;
	}

	.pagerNavText {
		min-width: 3.6em;
		padding: 0 0.4rem;
		font-size: 0.8em;
	}

	.pagerNavIconBtn {
		width: 2rem;
		min-width: 2rem;
	}

	.pagerGoInputCell {
		min-width: 2.5rem;
		padding: 0 0.28rem;
	}
}

.redeemSection {
	padding: 16px 18px;
	border-radius: 12px;
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-accent) 2%);
	box-shadow: 0 1px 2px color-mix(in srgb, var(--MI_THEME-fg) 3%, transparent);
}
.redeemRow {
	display: flex;
	align-items: flex-end;
	gap: 10px;
}
.redeemInput {
	flex: 1;
	min-width: 0;
}
</style>
