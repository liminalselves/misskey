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

		<!-- 我的自定义模型 -->
		<section v-if="byokEnabled" :class="$style.section">
			<div :class="$style.sectionHead">
				<div :class="$style.sectionTitle">
					<i class="ti ti-key"></i>
					{{ i18n.ts._agents.modelsTabCustom }}
					<span :class="$style.sectionCount">{{ userModels.length }}/{{ byokMaxUserModels }}</span>
				</div>
				<MkButton primary rounded small :disabled="userModels.length >= byokMaxUserModels" @click="openCreateModel">
					<i class="ti ti-plus"></i> {{ i18n.ts._agents.byokAddModel }}
				</MkButton>
			</div>
			<p :class="$style.sectionHint">{{ i18n.ts._agents.byokCustomHint }}</p>

			<button v-if="userModels.length === 0" type="button" class="_button" :class="$style.emptyState" @click="openCreateModel">
				<i class="ti ti-plus" :class="$style.emptyIcon"></i>
				<span>{{ i18n.ts._agents.byokNoModels }}</span>
			</button>

			<div v-else class="_gaps_s">
				<div v-for="m in userModels" :key="m.id" v-panel :class="[$style.card, { [$style.cardDisabled]: !m.enabled }]">
					<div :class="$style.cardHead">
						<div :class="$style.cardIcon"><i class="ti ti-key"></i></div>
						<div :class="$style.cardHeadMain">
							<div :class="$style.cardTitle">
								<span :class="$style.cardName">{{ m.name }}</span>
								<span v-if="providerNameOf(m)" :class="$style.providerBadge">{{ providerNameOf(m) }}</span>
								<span v-if="!m.enabled" :class="$style.disabledBadge">{{ i18n.ts._agents.byokDisabled }}</span>
							</div>
							<div :class="$style.cardSub">{{ m.apiModelName }} · {{ hostOf(m.baseUrl) }}</div>
						</div>
						<div :class="$style.cardHeadActions">
							<MkSwitch
								:modelValue="m.enabled"
								:noBody="true"
								:title="i18n.ts._agents.byokToggle"
								@update:modelValue="toggleModelEnabled(m, $event)"
							/>
							<button type="button" class="_button" :class="$style.iconBtn" :title="i18n.ts._agents.edit" @click="openEditModel(m)">
								<i class="ti ti-pencil"></i>
							</button>
							<button type="button" class="_button" :class="[$style.iconBtn, $style.iconDanger]" :title="i18n.ts._agents.byokDelete" @click="deleteModel(m)">
								<i class="ti ti-trash"></i>
							</button>
						</div>
					</div>
					<div :class="$style.chipRow">
						<span :class="$style.chip"><i class="ti ti-stack-2"></i>{{ i18n.ts._agents.modelRowLabelContext }} {{ formatTokenCountCompact(m.maxContextTokens) }}</span>
						<span :class="$style.chip"><i class="ti ti-message"></i>{{ i18n.ts._agents.modelRowLabelOutput }} {{ formatTokenCountCompact(m.maxOutputTokensPerCall) }}</span>
						<span v-if="successRates[m.id] && successRates[m.id].total > 0" :class="[$style.chip, getRateClass(successRates[m.id].success, successRates[m.id].total)]">
							<i class="ti ti-activity"></i>{{ i18n.ts._agents.modelRowLabelSuccess1h }} {{ ratePercent(successRates[m.id].success, successRates[m.id].total) }}%
						</span>
					</div>
				</div>
			</div>
		</section>

		<!-- 官方模型 -->
		<section :class="$style.section">
			<div :class="$style.sectionHead">
				<div :class="$style.sectionTitle">
					<i class="ti ti-cpu"></i>
					{{ i18n.ts._agents.modelsTabOfficial }}
				</div>
			</div>

			<MkInfo v-if="officialModels.length === 0">{{ i18n.ts._agents.noDataAvailable }}</MkInfo>

			<div v-else class="_gaps_s">
				<div v-for="m in officialModels" :key="m.id" v-panel :class="$style.card">
					<div :class="$style.cardHead">
						<div :class="$style.cardIcon"><i class="ti ti-cpu"></i></div>
						<div :class="$style.cardHeadMain">
							<div :class="$style.cardTitle">
								<span :class="$style.cardName">{{ m.name }}</span>
							</div>
							<div v-if="m.description" :class="$style.cardSub">{{ m.description }}</div>
						</div>
						<div :class="$style.costArea">
							<button
								v-if="m.billingMode === 'usage'"
								type="button"
								class="_button"
								:class="$style.priceLink"
								@click="openUsagePricing(m, $event)"
							>
								{{ i18n.ts._agents.billingUsageLabel }}<i class="ti ti-chevron-down" :class="$style.priceChevron"></i>
							</button>
							<span v-else-if="m.costPerCall === 0" :class="$style.costFree">{{ i18n.ts._agents.modelCostFree }}</span>
							<span v-else :class="$style.costValue">{{ m.costPerCall.toLocaleString(undefined, { maximumFractionDigits: 4 }) }}</span>
						</div>
					</div>
					<div :class="$style.chipRow">
						<span :class="$style.chip"><i class="ti ti-stack-2"></i>{{ i18n.ts._agents.modelRowLabelContext }} {{ formatTokenCountCompact(m.maxContextTokens) }}</span>
						<span :class="$style.chip"><i class="ti ti-message"></i>{{ i18n.ts._agents.modelRowLabelOutput }} {{ formatTokenCountCompact(m.maxOutputTokensPerCall) }}</span>
						<span v-if="successRates[m.id] && successRates[m.id].total > 0" :class="[$style.chip, getRateClass(successRates[m.id].success, successRates[m.id].total)]">
							<i class="ti ti-activity"></i>{{ i18n.ts._agents.modelRowLabelSuccess1h }} {{ ratePercent(successRates[m.id].success, successRates[m.id].total) }}%
						</span>
						<span v-if="freeQuota[m.id] && freeQuota[m.id].total > 0" :class="[$style.chip, $style.chipAccent]">
							<i class="ti ti-gift"></i>{{ i18n.ts._agents.modelChipFreeQuota }} {{ freeQuota[m.id].used }}/{{ freeQuota[m.id].total }}
						</span>
					</div>
				</div>
			</div>
		</section>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useCssModule } from 'vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkByokModelDialog from './byok-model-dialog.vue';
import MkByokProviderDialog from './byok-provider-dialog.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import type { AgentsByokModelsListResponse } from 'misskey-js/entities.js';

const $style = useCssModule();

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

const loading = ref(true);
const officialModels = ref<OfficialModelLite[]>([]);
const userModels = ref<UserModel[]>([]);
const successRates = ref<Record<string, SuccessRateRow>>({});
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

function formatTokenCountCompact(n: number): string {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
	if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
	return String(n);
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

function ratePercent(success: number, total: number): string {
	return total > 0 ? ((success / total) * 100).toFixed(1) : '0';
}

function getRateClass(success: number, total: number): string {
	if (total === 0) return $style.rateMuted;
	const rate = success / total;
	if (rate >= 0.9) return $style.rateOk;
	if (rate >= 0.7) return $style.rateWarn;
	return $style.rateErr;
}

function openUsagePricing(m: OfficialModelLite, ev: MouseEvent) {
	const items = [
		{ type: 'label' as const, text: i18n.ts._agents.billingInputCacheHit },
		{ type: 'label' as const, text: `${m.pricePerMillionInputCacheHitTokens ?? 0} / 1M tokens` },
		{ type: 'divider' as const },
		{ type: 'label' as const, text: i18n.ts._agents.billingInputCacheMiss },
		{ type: 'label' as const, text: `${m.pricePerMillionInputCacheMissTokens ?? 0} / 1M tokens` },
		{ type: 'divider' as const },
		{ type: 'label' as const, text: i18n.ts._agents.billingOutput },
		{ type: 'label' as const, text: `${m.pricePerMillionOutputTokens ?? 0} / 1M tokens` },
	];
	if (m.peakPriceMultiplier && m.peakPriceMultiplier > 1) {
		items.push({ type: 'divider' as const });
		items.push({ type: 'label' as const, text: `${i18n.ts._agents.billingPeakMultiplier} ×${m.peakPriceMultiplier}` });
	}
	os.popupMenu(items, ev.currentTarget ?? ev.target);
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
	} catch (e) {
		os.alert({ type: 'error', text: formatApiError(e) });
	} finally {
		loading.value = false;
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

.section {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.sectionHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
}

.sectionTitle {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 700;
	font-size: 1.05em;

	> i {
		color: var(--MI_THEME-accent);
	}
}

.sectionCount {
	font-size: 0.82em;
	font-weight: 600;
	opacity: 0.6;
}

.sectionHint {
	margin: 0;
	font-size: 0.82em;
	line-height: 1.5;
	color: var(--MI_THEME-fgTransparentWeak);
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

.card {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 14px 16px;
	border-radius: var(--MI-radius);
}

.cardDisabled {
	opacity: 0.65;
}

.cardHead {
	display: flex;
	align-items: center;
	gap: 12px;
	min-width: 0;
}

.cardIcon {
	flex-shrink: 0;
	width: 42px;
	height: 42px;
	border-radius: 12px;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 1.3rem;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.cardHeadMain {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.cardTitle {
	display: flex;
	align-items: center;
	gap: 6px;
	flex-wrap: wrap;
	min-width: 0;
}

.cardName {
	font-weight: 700;
	line-height: 1.35;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cardSub {
	font-size: 0.8em;
	font-family: monospace;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cardHeadActions {
	flex-shrink: 0;
	display: flex;
	align-items: center;
	gap: 2px;
}

.providerBadge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	height: 20px;
	padding: 0 8px;
	border-radius: 999px;
	font-size: 0.74em;
	font-weight: 700;
	line-height: 1;
	white-space: nowrap;
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 34%, var(--MI_THEME-divider));
}

.disabledBadge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	height: 20px;
	padding: 0 8px;
	border-radius: 999px;
	font-size: 0.74em;
	font-weight: 700;
	line-height: 1;
	white-space: nowrap;
	background: color-mix(in srgb, var(--MI_THEME-warn) 14%, var(--MI_THEME-panel));
	color: var(--MI_THEME-warn);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-warn) 34%, var(--MI_THEME-divider));
}

.chipRow {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.chip {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	height: 24px;
	padding: 0 10px;
	border-radius: 999px;
	font-size: 0.78em;
	font-weight: 600;
	line-height: 1;
	white-space: nowrap;
	border: solid 1px var(--MI_THEME-divider);
	background: color-mix(in srgb, var(--MI_THEME-fg) 5%, transparent);
	color: var(--MI_THEME-fg);

	> i {
		opacity: 0.55;
	}
}

.chipAccent {
	background: color-mix(in srgb, var(--MI_THEME-accent) 12%, var(--MI_THEME-panel));
	color: var(--MI_THEME-accent);
	border-color: color-mix(in srgb, var(--MI_THEME-accent) 34%, var(--MI_THEME-divider));

	> i {
		opacity: 0.8;
	}
}

.costArea {
	flex-shrink: 0;
	display: flex;
	align-items: center;
}

.costValue {
	font-weight: 700;
	color: var(--MI_THEME-accent);
}

.costFree {
	font-weight: 700;
	color: var(--MI_THEME-success);
}

.priceLink {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	font-weight: 700;
	color: var(--MI_THEME-accent);
}

.priceChevron {
	font-size: 0.85em;
}

.rateOk {
	color: var(--MI_THEME-success);
	border-color: color-mix(in srgb, var(--MI_THEME-success) 34%, var(--MI_THEME-divider));

	> i {
		opacity: 0.8;
	}
}

.rateWarn {
	color: var(--MI_THEME-warn);
	border-color: color-mix(in srgb, var(--MI_THEME-warn) 34%, var(--MI_THEME-divider));

	> i {
		opacity: 0.8;
	}
}

.rateErr {
	color: var(--MI_THEME-error);
	border-color: color-mix(in srgb, var(--MI_THEME-error) 34%, var(--MI_THEME-divider));

	> i {
		opacity: 0.8;
	}
}

.rateMuted {
	opacity: 0.6;
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
</style>
