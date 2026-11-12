<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.tabs" role="tablist">
		<button type="button" role="tab" class="_button" :class="[$style.tab, tab === 'billing' ? $style.tabOn : null]" :aria-selected="tab === 'billing'" @click="tab = 'billing'"><i class="ti ti-receipt"></i> 消费日志</button>
		<button type="button" role="tab" class="_button" :class="[$style.tab, tab === 'requests' ? $style.tabOn : null]" :aria-selected="tab === 'requests'" @click="tab = 'requests'"><i class="ti ti-history"></i> 请求记录</button>
		<span :class="$style.tabHint">{{ tab === 'billing' ? '额度收支流水，含兑换、签到与奖励' : '每一次模型调用' }}</span>
	</div>

	<!-- 消费日志 -->
	<template v-if="tab === 'billing'">
		<div v-if="billing.data.value == null && billing.loading.value" :class="$style.placeholder"><MkLoading/></div>
		<div v-else-if="billing.data.value == null && billing.error.value" :class="$style.placeholder">
			<MkResult type="error" text="加载失败"/>
			<MkButton rounded small @click="billing.load"><i class="ti ti-refresh"></i> 重试</MkButton>
		</div>
		<template v-else-if="billing.data.value != null">
			<MkResult v-if="billing.data.value.items.length === 0" type="empty" text="暂无消费记录"/>
			<div v-else :class="[$style.table, $style.billingCols, billing.loading.value ? $style.dim : null]">
				<div :class="$style.head"><span>时间</span><span>类型</span><span>明细</span><span>金额</span></div>
				<div v-for="it in billing.data.value.items" :key="it.id" :class="$style.row">
					<span><MkTime :time="it.createdAt" mode="detail"/></span>
					<span>
						<span :class="[$style.chip, billingTone(it) === 'ok' ? $style.chipOk : billingTone(it) === 'err' ? $style.chipErr : billingTone(it) === 'warn' ? $style.chipWarn : billingTone(it) === 'gift' ? $style.chipGift : billingTone(it) === 'redeem' ? $style.chipRedeem : $style.chipMuted]">{{ billingLabel(it) }}</span>
					</span>
					<span :class="$style.name">{{ it.kind === 'usage' ? (it.modelName ?? '—') : (it.redeemCode ?? '') }}</span>
					<span :class="[$style.amount, it.usedFreeQuota === true ? null : billingSign(it) > 0 ? $style.plus : $style.minus]">{{ billingAmount(it) }}</span>
				</div>
			</div>
			<MkPagerBar
				v-if="billing.data.value.total > 0"
				:page="billingPage"
				:total="billing.data.value.total"
				:pageSize="billingPageSize"
				:loading="billing.loading.value"
				@update:page="p => { billingPage = p; billing.load(); }"
				@update:pageSize="s => { billingPageSize = s; billingPage = 1; billing.load(); }"
			/>
		</template>
	</template>

	<!-- 请求记录 -->
	<template v-else>
		<div v-if="logs.data.value == null && logs.loading.value" :class="$style.placeholder"><MkLoading/></div>
		<div v-else-if="logs.data.value == null && logs.error.value" :class="$style.placeholder">
			<MkResult type="error" text="加载失败"/>
			<MkButton rounded small @click="logs.load"><i class="ti ti-refresh"></i> 重试</MkButton>
		</div>
		<template v-else-if="logs.data.value != null">
			<MkResult v-if="logs.data.value.items.length === 0" type="empty" text="暂无请求记录"/>
			<div v-else :class="[$style.table, $style.logCols, logs.loading.value ? $style.dim : null]">
				<div :class="$style.head"><span>时间</span><span>用途</span><span>模型</span><span>状态</span><span>耗时</span><span>Token</span><span>扣费</span></div>
				<div v-for="log in logs.data.value.items" :key="log.id" :class="$style.row">
					<span><MkTime :time="log.requestedAt" mode="detail"/></span>
					<span>{{ USAGE_KIND_LABELS[log.usageKind] ?? log.usageKind }}</span>
					<span :class="$style.name">
						{{ log.modelName ?? log.modelApiName ?? '—' }}
						<span v-if="log.modelSource === 'user'" :class="$style.tag">自带</span>
					</span>
					<span>
						<span :class="[$style.chip, log.status === 'success' ? $style.chipOk : log.status === 'failed' ? $style.chipErr : log.status === 'aborted' ? $style.chipWarn : $style.chipMuted]">{{ STATUS_LABELS[log.status] ?? log.status }}</span>
					</span>
					<span :class="$style.num">{{ fmtMs(log.durationMs) }}</span>
					<span :class="$style.num">{{ log.promptTokens != null || log.completionTokens != null ? fmtCompact((log.promptTokens ?? 0) + (log.completionTokens ?? 0)) : '—' }}</span>
					<span :class="$style.num">
						<template v-if="log.usedFreeQuota === true">免费 {{ log.freeQuotaUsedAtCall }}/{{ log.freeQuotaTotalAtCall }}</template>
						<template v-else>{{ log.cost > 0 ? fmtCredits(log.cost) : '0' }}</template>
					</span>
				</div>
			</div>
			<MkPagerBar
				v-if="logs.data.value.total > 0"
				:page="logsPage"
				:total="logs.data.value.total"
				:pageSize="logsPageSize"
				:loading="logs.loading.value"
				@update:page="p => { logsPage = p; logs.load(); }"
				@update:pageSize="s => { logsPageSize = s; logsPage = 1; logs.load(); }"
			/>
		</template>
	</template>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import MkPagerBar from './MkPagerBar.vue';
import { reportApi, useReportSection } from './use-report-section.js';
import { fmtCompact, fmtCredits, fmtMs, STATUS_LABELS, USAGE_KIND_LABELS } from './report-utils.js';
import MkButton from '@/components/MkButton.vue';

type BillingItem = {
	id: string;
	kind: 'usage' | 'redeem';
	createdAt: string;
	amount: number;
	modelName: string | null;
	usageKind: string | null;
	status: string | null;
	redeemCode: string | null;
	usedFreeQuota: boolean | null;
	freeQuotaUsedAtCall: number | null;
	freeQuotaTotalAtCall: number | null;
};
type LogItem = {
	id: string;
	requestedAt: string;
	durationMs: number | null;
	modelName: string | null;
	modelSource: 'official' | 'user' | null;
	modelApiName: string | null;
	usageKind: string;
	status: string;
	cost: number;
	promptTokens: number | null;
	completionTokens: number | null;
	usedFreeQuota: boolean | null;
	freeQuotaUsedAtCall: number | null;
	freeQuotaTotalAtCall: number | null;
};
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

const props = defineProps<{
	/** Endpoints and extra params differ between the user's own page and the moderator page. */
	billingEndpoint: string;
	logsEndpoint: string;
	params: Record<string, unknown>;
}>();

const tab = ref<'billing' | 'requests'>('billing');
const billingPage = ref(1);
const billingPageSize = ref(20);
const logsPage = ref(1);
const logsPageSize = ref(20);

const billing = useReportSection(() => reportApi<Page<BillingItem>>(props.billingEndpoint, {
	...props.params, page: billingPage.value, pageSize: billingPageSize.value, limit: billingPageSize.value,
}));
const logs = useReportSection(() => reportApi<Page<LogItem>>(props.logsEndpoint, {
	...props.params, page: logsPage.value, pageSize: logsPageSize.value,
}));

// Each tab loads on first open.
let logsLoaded = false;
watch(tab, t => {
	if (t === 'requests' && !logsLoaded) {
		logsLoaded = true;
		void logs.load();
	}
});
void billing.load();

/** Credit-flow rows (check-in, rewards, migration) are signed by amount; model calls always spend. */
const CREDIT_FLOW_KINDS = ['checkin', 'admin_reward', 'admin_compensation', 'credit_migration'];

function billingSign(it: BillingItem): number {
	if (it.kind === 'redeem') return 1;
	if (it.usageKind != null && CREDIT_FLOW_KINDS.includes(it.usageKind)) return it.amount > 0 ? 1 : -1;
	return -1;
}

function billingAmount(it: BillingItem): string {
	if (it.usedFreeQuota === true) return `免费 ${it.freeQuotaUsedAtCall}/${it.freeQuotaTotalAtCall}`;
	return `${billingSign(it) > 0 ? '+' : '-'}${Math.abs(it.amount).toFixed(4)}`;
}

function billingLabel(it: BillingItem): string {
	if (it.kind === 'redeem') return '卡密兑换';
	switch (it.usageKind) {
		case 'checkin': return it.amount > 0 ? '签到奖励' : '补签消耗';
		case 'admin_reward': return '奖励签发';
		case 'admin_compensation': return '补偿签发';
		case 'credit_migration': return '额度迁移';
	}
	const kind = it.usageKind != null ? (USAGE_KIND_LABELS[it.usageKind] ?? it.usageKind) : '调用';
	return `${kind} · ${STATUS_LABELS[it.status ?? ''] ?? '未知'}`;
}

function billingTone(it: BillingItem): 'ok' | 'err' | 'warn' | 'gift' | 'redeem' | 'muted' {
	if (it.kind === 'redeem') return 'redeem';
	if (it.usageKind != null && CREDIT_FLOW_KINDS.includes(it.usageKind)) return it.amount > 0 ? 'gift' : 'warn';
	if (it.status === 'success') return 'ok';
	if (it.status === 'failed') return 'err';
	if (it.status === 'aborted') return 'warn';
	return 'muted';
}

defineExpose({
	reload() {
		void billing.load();
		if (logsLoaded) void logs.load();
	},
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-width: 0;
}

.tabs {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 4px 6px;
}

.tab {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 6px 12px;
	border-radius: 8px;
	font-size: 0.85em;
	font-weight: 600;
	opacity: 0.7;

	&:hover {
		opacity: 1;
		background: color-mix(in srgb, var(--MI_THEME-fg) 6%, transparent);
	}
}

.tabOn {
	opacity: 1;
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, transparent);
}

.tabHint {
	margin-left: auto;
	font-size: 0.75em;
	opacity: 0.56;
}

.placeholder {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	padding: 24px 0;
}

.dim {
	opacity: 0.5;
	pointer-events: none;
}

/* One grid per table, rows display:contents, horizontal scroll, no truncation. */
.table {
	display: grid;
	overflow-x: auto;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 10px;
	font-size: 0.86em;
	font-variant-numeric: tabular-nums;
	transition: opacity 0.15s;
}

.billingCols {
	grid-template-columns: minmax(max-content, 1.3fr) minmax(max-content, 1.1fr) minmax(max-content, 1.4fr) minmax(max-content, 0.8fr);
}

.logCols {
	grid-template-columns: minmax(max-content, 1.3fr) minmax(max-content, 0.7fr) minmax(max-content, 1.4fr) repeat(4, minmax(max-content, 0.7fr));
}

.head,
.row {
	display: contents;

	> * {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 8px;
		white-space: nowrap;
		border-bottom: solid 1px var(--MI_THEME-divider);

		@media (pointer: coarse) {
			padding: 10px 8px;
		}
	}

	> *:first-child {
		padding-left: 14px;
	}

	> *:last-child {
		padding-right: 14px;
		justify-content: flex-end;
	}
}

.head > * {
	font-size: 0.86em;
	font-weight: 600;
	background: var(--MI_THEME-panel);
	opacity: 0.85;
}

.row:last-child > * {
	border-bottom: none;
}

.name {
	font-weight: 600;
}

.num {
	justify-content: flex-end;
}

.amount {
	font-weight: 600;
}

.plus {
	color: var(--MI_THEME-success);
}

.minus {
	color: var(--MI_THEME-error);
}

.tag {
	padding: 1px 6px;
	border-radius: 999px;
	font-size: 0.78em;
	font-weight: 500;
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, transparent);
	color: var(--MI_THEME-accent);
}

.chip {
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.85em;
	font-weight: 600;
}

.chipOk {
	color: var(--MI_THEME-success);
	background: color-mix(in srgb, var(--MI_THEME-success) 16%, transparent);
}

.chipErr {
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 16%, transparent);
}

.chipWarn {
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 16%, transparent);
}

.chipGift {
	color: #a855f7;
	background: color-mix(in srgb, #a855f7 16%, transparent);
}

.chipRedeem {
	color: #3d96c1;
	background: color-mix(in srgb, #3d96c1 16%, transparent);
}

.chipMuted {
	background: color-mix(in srgb, var(--MI_THEME-fg) 10%, transparent);
}
</style>
