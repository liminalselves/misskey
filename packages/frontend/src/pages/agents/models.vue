<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="['_gaps_m', $style.page]">
	<MkLoading v-if="loading"/>
	<template v-else>
		<!-- BYOK 未启用时的提示 -->
		<MkInfo v-if="!byokEnabled">
			{{ i18n.ts._agents.byokDisabledHint }}
		</MkInfo>

		<!-- 用户信息摘要：余额 / 官方模型数 / 自定义模型配额 -->
		<div v-panel :class="[$style.hero, $style.heroCompact]">
			<div :class="$style.heroSummary">
				<button type="button" class="_button" :class="[$style.heroItem, $style.heroItemLink]" :title="i18n.ts._agents.myStats" @click="goMyStats">
					<span :class="$style.heroLabel"><i class="ti ti-coin"></i>{{ i18n.ts._agents.myStatsCreditBalance }}</span>
					<span :class="$style.heroValue"><MkNumber v-if="creditBalance != null" :value="creditBalance" :tween="false"/><template v-else>-</template></span>
					<i class="ti ti-chevron-right" :class="$style.heroItemLinkIcon"></i>
				</button>
				<span :class="$style.heroItem">
					<span :class="$style.heroLabel"><i class="ti ti-cpu"></i>{{ i18n.ts._agents.modelsTabOfficial }}</span>
					<span :class="$style.heroValue">{{ officialModels.length }}</span>
				</span>
				<span v-if="byokEnabled" :class="$style.heroItem">
					<span :class="$style.heroLabel"><i class="ti ti-key"></i>{{ i18n.ts._agents.modelsTabCustom }}</span>
					<span :class="$style.heroValue">{{ userModels.length }}/{{ byokMaxUserModels }}</span>
					<button type="button" class="_button" :class="$style.infoBtn" @click="openByokHint">
						<i class="ti ti-info-circle"></i>
					</button>
				</span>
			</div>
		</div>

		<!-- 分组筛选 + 添加自定义模型入口 -->
		<div v-if="modelGroupTabs.length > 1 || byokEnabled" :class="$style.tabsRow">
			<div v-if="modelGroupTabs.length > 1" :class="$style.modelGroupTabs" role="tablist">
				<button
					v-for="t in modelGroupTabs"
					:key="t.key"
					type="button"
					role="tab"
					:aria-selected="modelGroupFilter === t.key"
					:class="[$style.modelGroupTab, modelGroupFilter === t.key ? $style.modelGroupTabActive : '']"
					@click="modelGroupFilter = t.key"
				>
					<span :class="$style.modelGroupTabLabel">{{ t.label }}</span>
					<span :class="$style.modelGroupTabCount">{{ t.count }}</span>
				</button>
			</div>
			<MkButton v-if="byokEnabled" primary rounded small :disabled="userModels.length >= byokMaxUserModels" :class="$style.tabsAction" @click="openCreateModel">
				<i class="ti ti-plus"></i> {{ i18n.ts._agents.byokAddModel }}
			</MkButton>
		</div>

		<MkInfo v-if="allModels.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>
		<MkInfo v-else-if="visibleModels.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>

		<!-- 统一模型卡片列表（官方 + 自定义） -->
		<div v-else :class="$style.selectCardList">
			<div
				v-for="m in visibleModels"
				:key="m.id"
				v-panel
				:class="[$style.selectCard, { [$style.cardDisabled]: m.userModel != null && !m.userModel.enabled }]"
			>
				<div :class="$style.selectCardMain">
					<div :class="$style.selectCardHead">
						<div :class="$style.selectCardTitleWrap">
							<div :class="$style.selectCardTitle">
								{{ m.name }}
								<span v-if="m.isUserModel" :class="$style.byokBadge">{{ i18n.ts._agents.byokCustomBadge }}</span>
								<span v-if="providerNameOfRow(m)" :class="$style.providerBadge">{{ providerNameOfRow(m) }}</span>
								<span v-if="m.userModel != null && !m.userModel.enabled" :class="$style.disabledBadge">{{ i18n.ts._agents.byokDisabled }}</span>
							</div>
							<p v-if="m.description" :class="$style.modelDescClamp">{{ m.description }}</p>
							<div v-else-if="m.userModel != null" :class="$style.modelMonoSub">{{ m.userModel.apiModelName }} · {{ hostOf(m.userModel.baseUrl) }}</div>
							<div :class="$style.modelMetaChips" role="list">
								<span
									:class="$style.modelMetaChip"
									:title="i18n.ts._agents.maxContextTokens"
									role="listitem"
								>
									<i class="ti ti-stack-2" :class="$style.modelMetaChipIcon" aria-hidden="true"></i>
									<span :class="$style.modelMetaChipKicker">{{ i18n.ts._agents.modelRowLabelContext }}</span>
									<span :class="$style.modelMetaChipVal">{{ formatTokenCountCompact(m.maxContextTokens) }}</span>
								</span>
								<span
									:class="$style.modelMetaChip"
									:title="i18n.ts._agents.maxOutputTokens"
									role="listitem"
								>
									<i class="ti ti-message-2" :class="$style.modelMetaChipIcon" aria-hidden="true"></i>
									<span :class="$style.modelMetaChipKicker">{{ i18n.ts._agents.modelRowLabelOutput }}</span>
									<span :class="$style.modelMetaChipVal">{{ formatTokenCountCompact(m.maxOutputTokensPerCall) }}</span>
								</span>
								<span
									v-if="m.billingMode === 'usage'"
									:class="[$style.modelMetaChip, $style.modelMetaChipInteractive]"
									:title="i18n.ts._agents.billingUsageDetailTooltip"
									role="listitem"
									tabindex="0"
									@click.stop="openUsagePricingMenu(m, $event)"
									@keydown.enter.stop="openUsagePricingMenu(m, $event)"
								>
									<i class="ti ti-coin" :class="$style.modelMetaChipIcon" aria-hidden="true"></i>
									<span :class="$style.modelMetaChipKicker">{{ i18n.ts._agents.modelRowLabelCost }}</span>
									<span :class="[$style.modelMetaChipVal, $style.modelMetaChipValAccent]">{{ i18n.ts._agents.billingUsageLabel }}</span>
									<i class="ti ti-chevron-down" :class="$style.modelMetaChipIcon" aria-hidden="true"></i>
								</span>
								<span
									v-else
									:class="$style.modelMetaChip"
									:title="i18n.ts._agents.modelCostPerCall"
									role="listitem"
								>
									<i class="ti ti-coin" :class="$style.modelMetaChipIcon" aria-hidden="true"></i>
									<span :class="$style.modelMetaChipKicker">{{ i18n.ts._agents.modelRowLabelCost }}</span>
									<span
										:class="[
											$style.modelMetaChipVal,
											typeof m.costPerCall === 'number' && m.costPerCall === 0
												? $style.modelMetaChipValHighlight
												: '',
										]"
									>{{ formatModelCostPerCall(m.costPerCall) }}</span>
								</span>
								<span
									:class="$style.modelMetaChip"
									:title="i18n.ts._agents.successRate1h"
									role="listitem"
								>
									<i class="ti ti-chart-line" :class="$style.modelMetaChipIcon" aria-hidden="true"></i>
									<span :class="$style.modelMetaChipKicker">{{ i18n.ts._agents.modelRowLabelSuccess1h }}</span>
									<template v-if="successRates[m.id] && successRates[m.id].total > 0">
										<!-- 动态类名必须写成 $style 字面量引用：生产构建的 unwind 插件只静态替换模板中的 $style.xxx，useCssModule() 在产线拿不到 __cssModules 会返回空对象 -->
										<span
											:class="[
												$style.modelMetaChipVal,
												$style.modelMetaChipValLong,
												{
													successRateHigh: $style.successRateHigh,
													successRateMedium: $style.successRateMedium,
													successRateLow: $style.successRateLow,
												}[getSuccessRateClass(successRates[m.id].success, successRates[m.id].total)],
											]"
										>
											{{ getSuccessRatePercentage(successRates[m.id].success, successRates[m.id].total) }}% ({{ successRates[m.id].success }}/{{ successRates[m.id].total }})
										</span>
									</template>
									<span v-else :class="[$style.modelMetaChipVal, $style.modelMetaChipValMuted]">{{ i18n.ts._agents.noDataAvailable }}</span>
								</span>
								<span v-if="freeQuota[m.id] && freeQuota[m.id].total > 0" :class="$style.modelMetaChip" role="listitem">
									<i class="ti ti-gift" :class="$style.modelMetaChipIcon" aria-hidden="true"></i>
									<span :class="$style.modelMetaChipKicker">{{ i18n.ts._agents.modelChipFreeQuota }}</span>
									<span :class="$style.modelMetaChipVal">{{ i18n.ts._agents.byokFreeQuotaUsed }} {{ freeQuota[m.id].used }}/{{ freeQuota[m.id].total }}</span>
								</span>
							</div>
						</div>
						<div v-if="m.userModel != null" :class="$style.cardActions">
							<MkSwitch
								:modelValue="m.userModel.enabled"
								:noBody="true"
								:title="i18n.ts._agents.byokToggle"
								@update:modelValue="toggleModelEnabled(m.userModel, $event)"
							/>
							<button type="button" class="_button" :class="$style.iconBtn" :title="i18n.ts._agents.edit" @click="openEditModel(m.userModel)">
								<i class="ti ti-pencil"></i>
							</button>
							<button type="button" class="_button" :class="[$style.iconBtn, $style.iconDanger]" :title="i18n.ts._agents.byokDelete" @click="deleteModel(m.userModel)">
								<i class="ti ti-trash"></i>
							</button>
						</div>
					</div>
				</div>
			</div>

			<!-- 自定义模型为空时的引导（自定义模型均归入「其他」分组） -->
			<button
				v-if="byokEnabled && userModels.length === 0 && (modelGroupFilter === '__all__' || modelGroupFilter === '__none__')"
				type="button"
				class="_button"
				:class="$style.emptyState"
				@click="openCreateModel"
			>
				<i class="ti ti-plus" :class="$style.emptyIcon"></i>
				<span>{{ i18n.ts._agents.byokNoModels }}</span>
				<span :class="$style.emptyHint">{{ i18n.ts._agents.byokCustomHint }}</span>
			</button>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkNumber from '@/components/MkNumber.vue';
import MkByokModelDialog from './byok-model-dialog.vue';
import MkByokProviderDialog from './byok-provider-dialog.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { useRouter } from '@/router.js';
import type { MenuItem } from '@/types/menu.js';
import type { AgentsByokModelsListResponse } from 'misskey-js/entities.js';

const router = useRouter();

type OfficialModelLite = {
	id: string;
	name: string;
	description: string | null;
	maxContextTokens: number;
	maxOutputTokensPerCall: number;
	costPerCall: number;
	billingMode?: 'per_call' | 'usage';
	pricePerMillionInputCacheHitTokens?: number;
	pricePerMillionInputCacheMissTokens?: number;
	pricePerMillionOutputTokens?: number;
	peakPriceMultiplier?: number | null;
	/** 所属分组名（来自 MetaLite agentModels.group）；null/无 表示未分组（归入「其他」） */
	group?: string | null;
};

type UserModel = AgentsByokModelsListResponse[number];

type ByokProvider = {
	id: string;
	name: string;
	description?: string | null;
	baseUrl: string;
	apiModelName?: string | null;
	maxContextTokens?: number | null;
	maxOutputTokensPerCall?: number | null;
	tokenizerEncoding?: string | null;
	charsPerToken?: number | null;
};

type SuccessRateRow = { total: number; success: number; failed: number; aborted: number };

/** 列表卡片统一视图模型：官方模型与 BYOK 自定义模型合并展示 */
type ModelRow = {
	id: string;
	name: string;
	description: string | null;
	maxContextTokens: number;
	maxOutputTokensPerCall: number;
	costPerCall: number;
	billingMode?: 'per_call' | 'usage';
	pricePerMillionInputCacheHitTokens?: number;
	pricePerMillionInputCacheMissTokens?: number;
	pricePerMillionOutputTokens?: number;
	peakPriceMultiplier?: number | null;
	group?: string | null;
	isUserModel: boolean;
	/** BYOK 自定义模型的原始记录（管理操作用）；官方模型为 null */
	userModel: UserModel | null;
};

const loading = ref(true);
const officialModels = ref<OfficialModelLite[]>([]);
const userModels = ref<UserModel[]>([]);
const successRates = ref<Record<string, SuccessRateRow>>({});
const creditBalance = ref<number | null>(null);
// 等待提供商弹窗关闭后再打开表单弹窗时暂存的选择；undefined 表示未选择
let pendingProvider: ByokProvider | null | undefined = undefined;
const freeQuota = ref<Record<string, { used: number; total: number }>>({});

const byokEnabled = computed(() => (instance as Record<string, unknown>).agentByokEnabled === true);
const byokMaxUserModels = computed(() => {
	const v = (instance as Record<string, unknown>).agentByokMaxUserModels;
	return typeof v === 'number' && v > 0 ? v : 20;
});
const providers = computed<ByokProvider[]>(() => {
	const raw = (instance as Record<string, unknown>).agentByokProviders;
	if (!raw || !Array.isArray(raw)) return [];
	return raw as ByokProvider[];
});

/** 官方 + 自定义合并后的模型列表（与聊天界面模型 tab 口径一致：官方在前，自定义在后） */
const allModels = computed<ModelRow[]>(() => {
	const official: ModelRow[] = officialModels.value.map(m => ({ ...m, isUserModel: false, userModel: null }));
	const custom: ModelRow[] = userModels.value.map(m => ({
		id: m.id,
		name: m.name,
		description: null,
		maxContextTokens: m.maxContextTokens,
		maxOutputTokensPerCall: m.maxOutputTokensPerCall,
		costPerCall: 0,
		billingMode: 'per_call',
		group: null,
		isUserModel: true,
		userModel: m,
	}));
	return [...official, ...custom];
});

/** 分组筛选：'__all__' 全部、'__none__' 其他（无分组）、其余为分组名 */
const modelGroupFilter = ref<string>('__all__');

type ModelGroupTab = { key: string; label: string; count: number };

/** 分组导航：全部 / 各分组（按站点分组顺序，仅显示有模型者）/ 其他 */
const modelGroupTabs = computed<ModelGroupTab[]>(() => {
	const models = allModels.value;
	const tabs: ModelGroupTab[] = [{ key: '__all__', label: i18n.ts._agents.modelGroupAll, count: models.length }];
	const rawGroups = (instance as Record<string, unknown>).agentLlmModelGroups;
	const groupOrder = Array.isArray(rawGroups) ? rawGroups.filter((g): g is string => typeof g === 'string') : [];
	for (const g of groupOrder) {
		const count = models.filter(m => m.group === g).length;
		if (count > 0) tabs.push({ key: g, label: g, count });
	}
	const ungrouped = models.filter(m => !m.group);
	if (ungrouped.length > 0) {
		tabs.push({ key: '__none__', label: i18n.ts._agents.modelGroupOther, count: ungrouped.length });
	}
	return tabs;
});

/** 按当前分组筛选后的模型列表 */
const visibleModels = computed(() => {
	const models = allModels.value;
	if (modelGroupFilter.value === '__all__') return models;
	if (modelGroupFilter.value === '__none__') return models.filter(m => !m.group);
	return models.filter(m => m.group === modelGroupFilter.value);
});

/** 模型列表行内展示用（无单位后缀，缩短数字） */
function formatTokenCountCompact(value: unknown): string {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) {
		return '—';
	}
	const t = Math.max(0, Math.trunc(n));
	if (t >= 1_000_000) {
		const m = t / 1_000_000;
		const s = m >= 10 ? String(Math.round(m)) : String(Math.round(m * 10) / 10).replace(/\.0$/, '');
		return `${s}M`;
	}
	if (t >= 1000) {
		const k = t / 1000;
		const rounded = k >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
		const s = String(rounded).replace(/\.0$/, '');
		return `${s}k`;
	}
	return String(t);
}

function formatModelCostPerCall(value: unknown): string {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n) || n < 0) {
		return '—';
	}
	if (n === 0) {
		return i18n.ts._agents.modelCostPerCallValueFree;
	}
	return n.toLocaleString();
}

function hostOf(baseUrl: string): string {
	try {
		return new URL(baseUrl).host;
	} catch {
		return baseUrl;
	}
}

function providerNameOf(m: UserModel): string | null {
	if (!m.providerId) return null;
	return providers.value.find(p => p.id === m.providerId)?.name ?? null;
}

function providerNameOfRow(m: ModelRow): string | null {
	return m.userModel != null ? providerNameOf(m.userModel) : null;
}

function getSuccessRatePercentage(success: number, total: number): string {
	if (total === 0) return '—';
	const percentage = (success / total) * 100;
	return Math.round(percentage).toFixed(0);
}

function getSuccessRateClass(success: number, total: number): string {
	if (total === 0) return '';
	const percentage = (success / total) * 100;
	if (percentage >= 90) return 'successRateHigh';
	if (percentage >= 70) return 'successRateMedium';
	return 'successRateLow';
}

/** 高峰时段判定（仅展示提示用，与后端结算口径一致：北京时间 9:00～12:00、14:00～18:00） */
function isBeijingPeakTimeNow(): boolean {
	const h = (new Date().getUTCHours() + 8) % 24;
	return (h >= 9 && h < 12) || (h >= 14 && h < 18);
}

/** 按量计费明细弹窗：三档单价 + 峰谷与当前状态 + 兜底（均为展示项） */
function openUsagePricingMenu(m: ModelRow, ev: MouseEvent | KeyboardEvent) {
	if (m.billingMode !== 'usage') return;
	const price = (v: number | undefined): string => (typeof v === 'number' && Number.isFinite(v) ? v : 0).toLocaleString();
	const peak = typeof m.peakPriceMultiplier === 'number' && m.peakPriceMultiplier > 1 ? m.peakPriceMultiplier : null;
	const inPeak = peak != null && isBeijingPeakTimeNow();
	const noop = () => {};
	const t = i18n.ts._agents;
	const items: MenuItem[] = [
		{ type: 'label', text: t.billingUsageDetailTitle },
		{ type: 'button', text: `${t.billingInputCacheHit} ${price(m.pricePerMillionInputCacheHitTokens)}`, action: noop },
		{ type: 'button', text: `${t.billingInputCacheMiss} ${price(m.pricePerMillionInputCacheMissTokens)}`, action: noop },
		{ type: 'button', text: `${t.billingOutput} ${price(m.pricePerMillionOutputTokens)}`, action: noop },
	];
	if (peak != null) {
		items.push(
			{ type: 'divider' },
			{
				type: 'button',
				icon: inPeak ? 'ti ti-sun' : 'ti ti-moon',
				text: i18n.tsx._agents.billingPeakShort({ mult: peak, state: inPeak ? t.billingPeakState : t.billingOffPeakState }),
				caption: t.billingPeakCaption,
				action: noop,
			},
		);
	}
	if (typeof m.costPerCall === 'number' && m.costPerCall > 0) {
		items.push({ type: 'button', icon: 'ti ti-shield', text: `${t.billingFallbackPerCall} ${m.costPerCall.toLocaleString()}`, caption: t.billingFallbackCaption, action: noop });
	}
	os.popupMenu(items, ev.currentTarget ?? ev.target);
}

function goMyStats() {
	router.push('/agents', { query: { view: 'my-stats' } });
}

function openByokHint() {
	os.alert({ type: 'info', text: i18n.ts._agents.byokCustomHint });
}

async function loadAll() {
	loading.value = true;
	try {
		const raw = (instance as Record<string, unknown>).agentModels;
		officialModels.value = Array.isArray(raw) ? raw as OfficialModelLite[] : [];
		if (byokEnabled.value) {
			userModels.value = await misskeyApi('agents/byok/models/list', {});
		} else {
			userModels.value = [];
		}
		const [rateRes, quotaRes] = await Promise.all([
			misskeyApi('agents/models/success-rates', { windowMs: 60 * 60 * 1000 }).catch(() => ({ rates: [] as { modelId: string; total: number; success: number; failed: number; aborted: number }[] })),
			misskeyApi('agents/models/free-quota', {}).catch(() => [] as { modelId: string; freeQuotaUsed: number; freeQuotaTotal: number }[]),
		]);
		const ratesMap: Record<string, SuccessRateRow> = {};
		for (const r of rateRes.rates) ratesMap[r.modelId] = { total: r.total, success: r.success, failed: r.failed, aborted: r.aborted };
		successRates.value = ratesMap;
		const quotaMap: Record<string, { used: number; total: number }> = {};
		for (const q of quotaRes) quotaMap[q.modelId] = { used: q.freeQuotaUsed, total: q.freeQuotaTotal };
		freeQuota.value = quotaMap;
		void loadCreditBalance();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		loading.value = false;
	}
}

async function loadCreditBalance() {
	try {
		const r = await misskeyApi('agents/credit-balance' as any, {}) as { creditBalance: number };
		creditBalance.value = r.creditBalance;
	} catch {
		creditBalance.value = null;
	}
}

function openCreateModel() {
	if (providers.value.length === 0) {
		openModelDialog(null);
		return;
	}
	const { dispose } = os.popup(MkByokProviderDialog, {
		providers: providers.value,
	}, {
		// 先记录选择，等提供商弹窗完全关闭后再打开表单弹窗，避免两个弹窗重叠
		selected: (provider: ByokProvider | null) => {
			pendingProvider = provider;
		},
		closed: () => {
			dispose();
			const p = pendingProvider;
			pendingProvider = undefined;
			if (p !== undefined) {
				openModelDialog(p);
			}
		},
	});
}

function openModelDialog(provider: ByokProvider | null) {
	const { dispose } = os.popup(MkByokModelDialog, {
		provider,
		model: null,
		existingNames: [
			...officialModels.value.map(m => m.name),
			...userModels.value.map(m => m.name),
		],
	}, {
		closed: () => { dispose(); loadAll(); },
	});
}

function openEditModel(m: UserModel) {
	const { dispose } = os.popup(MkByokModelDialog, {
		provider: null,
		model: m,
		existingNames: [
			...officialModels.value.map(x => x.name),
			...userModels.value.filter(x => x.id !== m.id).map(x => x.name),
		],
	}, {
		closed: () => { dispose(); loadAll(); },
	});
}

async function toggleModelEnabled(m: UserModel, enabled: boolean) {
	try {
		await misskeyApi('agents/byok/models/update', { modelId: m.id, enabled });
		m.enabled = enabled;
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
		loadAll();
	}
}

async function deleteModel(m: UserModel) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._agents.byokDeleteConfirm,
	});
	if (canceled) return;
	try {
		await misskeyApi('agents/byok/models/delete', { modelId: m.id });
		loadAll();
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	}
}

onMounted(loadAll);
</script>

<style lang="scss" module>
.page {
	--MI_SPACER-w: 100%;
}

/* 顶部用户信息摘要卡（对齐聊天界面模型 tab 的 hero 设计） */
.hero {
	padding: 0.9em 1.05em;
	border-radius: 12px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 16%, var(--MI_THEME-divider));
	background: linear-gradient(145deg, color-mix(in srgb, var(--MI_THEME-accent) 11%, var(--MI_THEME-panel)), var(--MI_THEME-panel));
	box-shadow: 0 1px 2px color-mix(in srgb, var(--MI_THEME-fg) 3%, transparent);
}

.heroCompact {
	padding: 0.6em 0.85em;
	background: color-mix(in srgb, var(--MI_THEME-accent) 7%, var(--MI_THEME-panel));
}

.heroSummary {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5em 1.15em;
	min-width: 0;
}

.heroItem {
	display: inline-flex;
	align-items: center;
	gap: 0.35em;
	font-size: 0.88em;
	min-width: 0;
}

.heroItemLink {
	border-radius: 8px;
	padding: 0.15em 0.35em;
	margin: -0.15em -0.35em;
	transition: background 0.15s ease;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}
}

.heroItemLinkIcon {
	font-size: 0.85em;
	opacity: 0.45;
}

.heroLabel {
	display: inline-flex;
	align-items: center;
	gap: 0.3em;
	opacity: 0.85;

	> i {
		opacity: 0.6;
	}
}

.heroValue {
	font-weight: 700;
	color: var(--MI_THEME-accent);
}

.infoBtn {
	display: inline-flex;
	align-items: center;
	padding: 2px;
	opacity: 0.5;
	transition: opacity 0.15s ease;

	&:hover {
		opacity: 1;
	}
}

/* 分组筛选行：pills 在左，主操作按钮在右 */
.tabsRow {
	display: flex;
	align-items: center;
	gap: 0.5em 0.75em;
	flex-wrap: wrap;
}

.tabsAction {
	margin-left: auto;
	flex-shrink: 0;
}

/* 分组筛选导航：全部 / 各分组 / 其他 */
.modelGroupTabs {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4em;
}

.modelGroupTab {
	display: inline-flex;
	align-items: center;
	gap: 0.45em;
	padding: 0.32em 0.8em;
	border-radius: 999px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	font-size: 0.9em;
	cursor: pointer;
	transition: border-color 0.15s, background 0.15s;

	&:hover {
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 45%, var(--MI_THEME-divider));
	}
}

.modelGroupTabActive {
	border-color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
	font-weight: 600;
}

.modelGroupTabLabel {
	white-space: nowrap;
}

.modelGroupTabCount {
	padding: 0 0.45em;
	border-radius: 999px;
	font-size: 0.82em;
	line-height: 1.5;
	background: color-mix(in srgb, var(--MI_THEME-fg) 12%, transparent);
	opacity: 0.75;
}

/* 模型卡片列表（对齐聊天界面模型 tab 的卡片设计） */
.selectCardList {
	display: grid;
	/* 防止子项 min-content 把轨道撑出容器（窄屏下内容异常时也不允许横向溢出） */
	grid-template-columns: minmax(0, 1fr);
	min-width: 0;
	gap: 0.75em;
}

.selectCard {
	min-width: 0;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: calc(var(--MI-radius) * 0.92);
	background: linear-gradient(155deg, color-mix(in srgb, var(--MI_THEME-panel) 88%, transparent), var(--MI_THEME-panel));
	transition: border-color 0.15s ease, box-shadow 0.15s ease;

	&:hover {
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 35%, var(--MI_THEME-divider));
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
	}
}

.cardDisabled {
	opacity: 0.65;
}

.selectCardMain {
	padding: 0.65em 0.85em;
	display: flex;
	flex-direction: column;
	gap: 0.35em;
	min-width: 0;
}

.selectCardHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75em;
}

.selectCardTitleWrap {
	min-width: 0;
	flex: 1;
}

.selectCardTitle {
	font-size: 0.95em;
	font-weight: 700;
	line-height: 1.25;
	word-break: break-word;
}

.byokBadge {
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
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 34%, var(--MI_THEME-divider));
}

.providerBadge {
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
	white-space: nowrap;
	background: color-mix(in srgb, var(--MI_THEME-fg) 7%, var(--MI_THEME-panel));
	color: var(--MI_THEME-fg);
	border: solid 1px var(--MI_THEME-divider);
}

.disabledBadge {
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
	white-space: nowrap;
	background: color-mix(in srgb, var(--MI_THEME-warn) 14%, var(--MI_THEME-panel));
	color: var(--MI_THEME-warn);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-warn) 34%, var(--MI_THEME-divider));
}

.modelDescClamp {
	margin: 0;
	padding-top: 0.2em;
	font-size: 0.82em;
	line-height: 1.4;
	opacity: 0.78;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
	word-break: break-word;
}

.modelMonoSub {
	padding-top: 0.2em;
	font-size: 0.78em;
	font-family: monospace;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.modelMetaChips {
	display: flex;
	flex-wrap: wrap;
	align-items: stretch;
	gap: 0.4em 0.45em;
	margin-top: 0.45em;
	font-size: 0.78em;
	line-height: 1.25;
	min-width: 0;
	max-width: 100%;
}

.modelMetaChip {
	display: inline-flex;
	align-items: center;
	gap: 0.32em 0.4em;
	min-height: 1.85em;
	padding: 0.28em 0.55em 0.28em 0.42em;
	border-radius: 8px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 85%, var(--MI_THEME-accent) 4%);
	background: color-mix(in srgb, var(--MI_THEME-bg) 38%, var(--MI_THEME-panel));
	box-shadow: 0 1px 0 color-mix(in srgb, var(--MI_THEME-fg) 4%, transparent);
}

.modelMetaChipIcon {
	font-size: 0.95em;
	opacity: 0.48;
	flex-shrink: 0;
	line-height: 1;
}

.modelMetaChipKicker {
	font-weight: 600;
	opacity: 0.58;
	white-space: nowrap;
	flex-shrink: 0;
}

.modelMetaChipVal {
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	min-width: 0;
	white-space: nowrap;
}

.modelMetaChipValHighlight {
	color: color-mix(in srgb, var(--MI_THEME-success, #22c55e) 88%, var(--MI_THEME-fg) 12%);
}

.modelMetaChipValAccent {
	color: var(--MI_THEME-accent);
}

.modelMetaChipInteractive {
	cursor: pointer;
}

.modelMetaChipInteractive:hover {
	opacity: 0.8;
}

.modelMetaChipValMuted {
	font-weight: 600;
	opacity: 0.52;
	white-space: normal;
}

.modelMetaChipValLong {
	text-align: end;
	line-height: 1.25;
	max-width: min(12.5em, 100%);
	white-space: normal;
	word-break: break-word;
}

.successRateHigh {
	color: var(--MI_THEME-success, #84cc16);
}

.successRateMedium {
	color: var(--MI_THEME-warn, #f59e0b);
}

.successRateLow {
	color: var(--MI_THEME-error, #ef4444);
}

.cardActions {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 2px;
}

.iconBtn {
	opacity: 0.75;
	padding: 6px;

	&:hover {
		opacity: 1;
	}
}

.iconDanger {
	color: var(--MI_THEME-error);
}

.emptyState {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	width: 100%;
	padding: 28px 16px;
	border: dashed 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	transition: border-color 0.15s ease, color 0.15s ease;

	&:hover {
		border-color: color-mix(in srgb, var(--MI_THEME-accent) 45%, var(--MI_THEME-divider));
		color: var(--MI_THEME-accent);
	}
}

.emptyIcon {
	font-size: 1.4em;
}

.emptyHint {
	font-size: 0.82em;
	line-height: 1.5;
	opacity: 0.7;
	max-width: 32em;
}
</style>
