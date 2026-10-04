<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
	<div class="_gaps_m">
		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-receipt"></i></template>
			<template #label>{{ i18n.ts._agents.billingLog }}</template>
			<MkLoading v-if="billingLoading" />
			<MkInfo v-else-if="billingItems.length === 0">{{
				i18n.ts._agents.myStatsNoLogs
			}}</MkInfo>
			<template v-else>
				<div :class="$style.table">
					<div :class="[$style.row, $style.headRow, $style.billingCols]">
						<span>{{ i18n.ts._agents.myStatsTime }}</span>
						<span>{{ i18n.ts._agents.billingType }}</span>
						<span>{{ i18n.ts._agents.billingDetail }}</span>
						<span :class="$style.num">{{ i18n.ts._agents.billingAmount }}</span>
					</div>
					<div
						v-for="item in billingItems"
						:key="item.id"
						:class="[$style.row, $style.rowData, $style.billingCols]"
					>
						<span :class="$style.name"
							><MkTime :time="item.createdAt" mode="detail"
						/></span>
						<span :class="$style.billingTypeCell">
							<span
								v-if="item.kind === 'usage' && item.usageKind === 'checkin'"
								:class="[
									$style.billingStatusChip,
									item.amount > 0
										? $style.badgeCheckinReward
										: $style.badgeCheckinMakeup,
								]"
								>{{ billingUsageSubkindLabel(item) }}</span
							>
							<span
								v-else-if="
									item.kind === 'usage' &&
									(item.usageKind === 'admin_reward' ||
										item.usageKind === 'credit_migration')
								"
								:class="[$style.billingStatusChip, $style.badgeAdminReward]"
								>{{ billingUsageSubkindLabel(item) }}</span
							>
							<span
								v-else-if="item.kind === 'usage'"
								:class="[
									$style.billingStatusChip,
									item.status === 'pending'
										? $style.badgePending
										: item.status === 'success'
											? $style.badgeOk
											: item.status === 'failed'
												? $style.badgeErr
												: $style.badgeWarn,
								]"
							>
								<span :class="$style.billingStatusPrefix">{{
									billingUsageSubkindLabel(item)
								}}</span>
								<span :class="$style.billingStatusSep">·</span>
								<span>{{ billingUsageRowStatus(item.status) }}</span>
							</span>
							<span v-else :class="[$style.badge, $style.badgeRedeem]"
								><i class="ti ti-ticket"></i>
								{{ i18n.ts._agents.billingKindRedeem }}</span
							>
						</span>
						<span :class="$style.name">{{
							item.kind === "usage"
								? (item.modelName ?? "—")
								: (item.redeemCode ?? "")
						}}</span>
						<span
							:class="[
								$style.num,
								item.usedFreeQuota === true
									? null
									: item.kind === 'redeem' || item.amount > 0
										? $style.colorOk
										: $style.colorErr,
							]"
						>
							<template v-if="item.usedFreeQuota === true"
								>免费次数 {{ item.freeQuotaUsedAtCall }}/{{
									item.freeQuotaTotalAtCall
								}}</template
							>
							<template v-else>{{ formatBillingAmount(item) }}</template>
						</span>
					</div>
				</div>
				<div :class="$style.pagerBar">
					<div :class="$style.pageSizes">
						<button
							v-for="size in pageSizeOptions"
							:key="size"
							type="button"
							class="_button"
							:class="[
								$style.pagerSizeBtn,
								billingPageSize === size ? $style.pagerSizeBtnActive : null,
							]"
							@click="setBillingPageSize(size)"
						>
							{{ size }}
						</button>
					</div>
					<button
						type="button"
						class="_button"
						:class="$style.pagerNavBtn"
						:disabled="billingPage <= 1 || billingLoading"
						@click="loadBilling(billingPage - 1)"
					>
						<i class="ti ti-chevron-left"></i>
					</button>
					<span :class="$style.pagerText"
						>{{ billingPage }} / {{ billingTotalPages }}</span
					>
					<button
						type="button"
						class="_button"
						:class="$style.pagerNavBtn"
						:disabled="billingPage >= billingTotalPages || billingLoading"
						@click="loadBilling(billingPage + 1)"
					>
						<i class="ti ti-chevron-right"></i>
					</button>
				</div>
			</template>
		</MkFolder>

		<MkFolder :defaultOpen="true">
			<template #icon><i class="ti ti-chart-bar"></i></template>
			<template #label
				>{{ i18n.ts._agents.myStatsModelStats }}（{{ rangeLabel }}）</template
			>
			<MkLoading v-if="detailsLoading && details == null" />
			<MkInfo v-else-if="details == null || details.modelStats.length === 0">{{
				i18n.ts._agents.noDataAvailable
			}}</MkInfo>
			<div v-else :class="$style.table">
				<div :class="[$style.row, $style.headRow, $style.modelCols]">
					<span>{{ i18n.ts._agents.myStatsModel }}</span>
					<span :class="$style.num">{{
						i18n.ts._agents.myStatsStatusSuccess
					}}</span>
					<span :class="$style.num">{{
						i18n.ts._agents.myStatsStatusFailed
					}}</span>
					<span :class="$style.num">{{
						i18n.ts._agents.myStatsStatusAborted
					}}</span>
					<span :class="$style.num">{{ i18n.ts._agents.successRate }}</span>
					<span :class="$style.num">{{ i18n.ts._agents.myStatsCost }}</span>
					<span :class="$style.num">免费次数</span>
				</div>
				<div
					v-for="model in details.modelStats"
					:key="model.modelId ?? '__null__'"
					:class="[$style.row, $style.rowData, $style.modelCols]"
				>
					<span :class="$style.name" :title="model.modelName ?? undefined">
						{{ model.modelName ?? "—" }}
						<span
							v-if="model.modelSource === 'user'"
							:class="$style.customBadge"
							>{{ i18n.ts._agents.byokCustomBadge }}</span
						>
					</span>
					<span :class="[$style.num, $style.colorOk]">{{ model.success }}</span>
					<span
						:class="[$style.num, model.failed > 0 ? $style.colorErr : null]"
						>{{ model.failed }}</span
					>
					<span
						:class="[$style.num, model.aborted > 0 ? $style.colorWarn : null]"
						>{{ model.aborted }}</span
					>
					<span :class="$style.num">{{
						model.total > 0
							? ((model.success / model.total) * 100).toFixed(1) + "%"
							: "—"
					}}</span>
					<span :class="$style.num">{{ model.totalCost.toFixed(4) }}</span>
					<span :class="$style.num">{{
						model.freeQuotaUsed > 0 ? `${model.freeQuotaUsed} 次` : "—"
					}}</span>
				</div>
			</div>
		</MkFolder>

		<slot name="recentLogs"></slot>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-users"></i></template>
			<template #label
				>{{ i18n.ts._agents.myStatsCharacterStats }} ({{
					details?.characterStatsTotal ?? 0
				}})</template
			>
			<MkLoading v-if="detailsLoading && details == null" />
			<MkInfo v-else-if="characterStatsItems.length === 0">{{
				i18n.ts._agents.noDataAvailable
			}}</MkInfo>
			<template v-else>
				<div :class="$style.table">
					<div
						v-for="item in characterStatsItems"
						:key="item.characterId"
						:class="[$style.row, $style.rowData, $style.simpleCols]"
					>
						<span :class="$style.name">{{ item.characterName ?? "—" }}</span>
						<span :class="$style.num">{{ item.total }}</span>
					</div>
				</div>
				<div v-if="characterStatsHasMore" :class="$style.loadMore">
					<MkButton
						rounded
						:disabled="characterStatsLoading"
						@click="loadMoreCharacterStats"
						>{{ i18n.ts.loadMore }}</MkButton
					>
				</div>
			</template>
		</MkFolder>

		<MkFolder :defaultOpen="false">
			<template #icon><i class="ti ti-message-cog"></i></template>
			<template #label
				>{{ i18n.ts._agents.myStatsStyleStats }} ({{
					details?.dialogueStyleStatsTotal ?? 0
				}})</template
			>
			<MkLoading v-if="detailsLoading && details == null" />
			<MkInfo v-else-if="styleStatsItems.length === 0">{{
				i18n.ts._agents.noDataAvailable
			}}</MkInfo>
			<template v-else>
				<div :class="$style.table">
					<div
						v-for="item in styleStatsItems"
						:key="item.dialogueStyleId"
						:class="[$style.row, $style.rowData, $style.simpleCols]"
					>
						<span :class="$style.name">{{
							item.dialogueStyleName ?? "—"
						}}</span>
						<span :class="$style.num">{{ item.total }}</span>
					</div>
				</div>
				<div v-if="styleStatsHasMore" :class="$style.loadMore">
					<MkButton
						rounded
						:disabled="styleStatsLoading"
						@click="loadMoreStyleStats"
						>{{ i18n.ts.loadMore }}</MkButton
					>
				</div>
			</template>
		</MkFolder>
	</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from "vue";
import MkButton from "@/components/MkButton.vue";
import MkFolder from "@/components/MkFolder.vue";
import MkInfo from "@/components/MkInfo.vue";
import MkLoading from "@/components/global/MkLoading.vue";
import { misskeyApi } from "@/utility/misskey-api.js";
import { i18n } from "@/i18n.js";
import { agentUsageKindLabel } from "@/utility/agent-usage-charts.js";

type UsageKind =
	| "chat"
	| "compression"
	| "image_generation"
	| "vision"
	| "sticker_description"
	| "proactive_random"
	| "proactive_scheduled"
	| "checkin"
	| "admin_reward"
	| "credit_migration";
type ModelStat = {
	modelId: string | null;
	modelName: string | null;
	modelSource: "official" | "user" | null;
	total: number;
	success: number;
	failed: number;
	aborted: number;
	totalCost: number;
	freeQuotaUsed: number;
	freeQuotaTotal: number;
};
type CharacterStat = {
	characterId: string;
	characterName: string | null;
	total: number;
};
type StyleStat = {
	dialogueStyleId: string;
	dialogueStyleName: string | null;
	total: number;
};
type UsageDetails = {
	modelStats: ModelStat[];
	characterStats: CharacterStat[];
	characterStatsTotal: number;
	dialogueStyleStats: StyleStat[];
	dialogueStyleStatsTotal: number;
};
type BillingItem = {
	id: string;
	kind: "usage" | "redeem";
	createdAt: string;
	amount: number;
	modelName: string | null;
	usageKind: UsageKind | null;
	status: string | null;
	durationMs: number | null;
	redeemCode: string | null;
	usedFreeQuota: boolean | null;
	freeQuotaUsedAtCall: number | null;
	freeQuotaTotalAtCall: number | null;
};
type BillingResponse = {
	items: BillingItem[];
	hasMore: boolean;
	total: number;
	page: number;
	pageSize: number;
};

const props = defineProps<{
	userId: string;
	hours: number;
	rangeLabel: string;
}>();
const pageSizeOptions = [10, 20, 50] as const;
const details = ref<UsageDetails | null>(null);
const detailsLoading = ref(false);
const billingItems = ref<BillingItem[]>([]);
const billingLoading = ref(false);
const billingPage = ref(1);
const billingTotal = ref(0);
const billingPageSize = ref(20);
const billingTotalPages = computed(() =>
	Math.max(1, Math.ceil(billingTotal.value / billingPageSize.value)),
);
const characterStatsItems = ref<CharacterStat[]>([]);
const characterStatsLoading = ref(false);
const characterStatsHasMore = computed(
	() =>
		characterStatsItems.value.length <
		(details.value?.characterStatsTotal ?? 0),
);
const styleStatsItems = ref<StyleStat[]>([]);
const styleStatsLoading = ref(false);
const styleStatsHasMore = computed(
	() =>
		styleStatsItems.value.length <
		(details.value?.dialogueStyleStatsTotal ?? 0),
);

async function loadDetails() {
	detailsLoading.value = true;
	try {
		const response = (await misskeyApi(
			"admin/users/agent-usage-details" as any,
			{ userId: props.userId, hours: props.hours },
		)) as UsageDetails;
		details.value = response;
		characterStatsItems.value = response.characterStats;
		styleStatsItems.value = response.dialogueStyleStats;
	} finally {
		detailsLoading.value = false;
	}
}

async function loadBilling(page: number) {
	billingLoading.value = true;
	try {
		const response = (await misskeyApi(
			"admin/users/agent-billing-logs" as any,
			{
				userId: props.userId,
				limit: billingPageSize.value,
				page,
				pageSize: billingPageSize.value,
			},
		)) as BillingResponse;
		billingItems.value = response.items;
		billingTotal.value = response.total;
		billingPage.value = response.page;
		billingPageSize.value = response.pageSize;
	} finally {
		billingLoading.value = false;
	}
}

function setBillingPageSize(pageSize: number) {
	if (billingPageSize.value === pageSize) return;
	billingPageSize.value = pageSize;
	loadBilling(1);
}

async function loadMoreCharacterStats() {
	characterStatsLoading.value = true;
	try {
		const response = (await misskeyApi(
			"admin/users/agent-usage-details" as any,
			{
				userId: props.userId,
				hours: props.hours,
				characterStatsOffset: characterStatsItems.value.length,
				characterStatsLimit: 10,
				dialogueStyleStatsLimit: 1,
			},
		)) as UsageDetails;
		characterStatsItems.value.push(...response.characterStats);
	} finally {
		characterStatsLoading.value = false;
	}
}

async function loadMoreStyleStats() {
	styleStatsLoading.value = true;
	try {
		const response = (await misskeyApi(
			"admin/users/agent-usage-details" as any,
			{
				userId: props.userId,
				hours: props.hours,
				characterStatsLimit: 1,
				dialogueStyleStatsOffset: styleStatsItems.value.length,
				dialogueStyleStatsLimit: 10,
			},
		)) as UsageDetails;
		styleStatsItems.value.push(...response.dialogueStyleStats);
	} finally {
		styleStatsLoading.value = false;
	}
}

function billingUsageSubkindLabel(item: BillingItem): string {
	if (item.usageKind === "checkin") return item.amount > 0 ? "签到奖励" : "补签消耗";
	if (item.usageKind === "admin_reward") return "奖励签发";
	if (item.usageKind === "credit_migration") return "额度迁移";
	return item.usageKind
		? agentUsageKindLabel(item.usageKind)
		: i18n.ts._agents.billingKindUsage;
}

function billingUsageRowStatus(status: string | null): string {
	if (status === "pending") return i18n.ts._agents.myStatsStatusPending;
	if (status === "success") return i18n.ts._agents.myStatsStatusSuccess;
	if (status === "failed") return i18n.ts._agents.myStatsStatusFailed;
	if (status === "aborted") return i18n.ts._agents.billingLogStatusAborted;
	return i18n.ts._agents.billingUsageStatusUnknown;
}

function formatBillingAmount(item: BillingItem): string {
	const value = Math.abs(item.amount).toFixed(4);
	return item.kind === "redeem" || item.amount > 0 ? `+${value}` : `-${value}`;
}

async function reload() {
	await Promise.all([loadDetails(), loadBilling(1)]);
}

defineExpose({ reload });
watch(() => props.hours, loadDetails);
onMounted(reload);
</script>

<style lang="scss" module>
.table {
	display: flex;
	flex-direction: column;
	border-radius: 12px;
	overflow-x: auto;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}
.row {
	display: grid;
	padding: 10px 14px;
	align-items: center;
	gap: 8px;
	font-size: 0.9em;
}
.row > * {
	min-width: 0;
}
.row:not(:last-child) {
	border-bottom: solid 1px var(--MI_THEME-divider);
}
.headRow {
	padding: 8px 14px;
	font-size: 0.76em;
	font-weight: 600;
	opacity: 0.56;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	background: color-mix(
		in srgb,
		var(--MI_THEME-panel) 70%,
		var(--MI_THEME-divider)
	);
}
.billingCols {
	grid-template-columns: minmax(150px, 1.3fr) minmax(170px, 1.1fr) minmax(
			120px,
			1fr
		) minmax(80px, 0.55fr);
	min-width: 620px;
}
.modelCols {
	grid-template-columns: 2.4fr 0.7fr 0.7fr 0.7fr 0.9fr 1fr 0.9fr;
	min-width: 700px;
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
.colorOk {
	color: var(--MI_THEME-success);
}
.colorErr {
	color: var(--MI_THEME-error);
}
.colorWarn {
	color: var(--MI_THEME-warn);
}
.badge {
	display: inline-block;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.82em;
	font-weight: 600;
	line-height: 1.3;
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
.badgePending {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent);
}
.badgeRedeem {
	color: #3da2ff;
	background: #3da2ff26;
}
.badgeCheckinReward {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 16%, transparent);
}
.badgeCheckinMakeup {
	color: var(--MI_THEME-warn);
	background: color-mix(in srgb, var(--MI_THEME-warn) 16%, transparent);
}
.badgeAdminReward {
	color: #a855f7;
	background: color-mix(in srgb, #a855f7 16%, transparent);
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
	overflow: hidden;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.82em;
	font-weight: 600;
	line-height: 1.35;
	white-space: nowrap;
}
.billingStatusPrefix {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.billingStatusSep {
	opacity: 0.5;
}
.customBadge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	height: 20px;
	padding: 0 8px;
	margin-left: 6px;
	border-radius: 999px;
	font-size: 0.74em;
	font-weight: 700;
	line-height: 1;
	vertical-align: middle;
	background: color-mix(
		in srgb,
		var(--MI_THEME-accent) 14%,
		var(--MI_THEME-panel)
	);
	color: var(--MI_THEME-accent);
	border: solid 1px
		color-mix(in srgb, var(--MI_THEME-accent) 34%, var(--MI_THEME-divider));
}
.loadMore {
	display: flex;
	justify-content: center;
	padding: 14px 0 4px;
}
.pagerBar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding: 10px 0 4px;
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
	font-size: 0.85em;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	min-width: 4em;
	text-align: center;
}
</style>
