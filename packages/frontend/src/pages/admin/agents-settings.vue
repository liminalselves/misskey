<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<MkInfo>{{ i18n.ts._agents.adminSettingsDescription }}</MkInfo>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-toggle-right"></i></template>
				<template #label>{{ i18n.ts._agents.adminSectionFeature }}</template>
				<div class="_gaps">
					<MkSwitch v-model="form.state.agentFeatureEnabled">
						<template #label>{{ i18n.ts._agents.featureEnabled }}</template>
					</MkSwitch>
					<MkTextarea v-model="form.state.agentGlobalSystemPrompt">
						<template #label>{{ i18n.ts._agents.globalPrompt }}</template>
					</MkTextarea>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-list-details"></i></template>
				<template #label>{{ i18n.ts._agents.adminSectionModels }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.adminModelListHint }}</MkInfo>

					<div v-if="form.state.agentLlmModelRows.length === 0" :class="$style.emptyModels">
						{{ i18n.ts._agents.adminModelListEmpty }}
					</div>

					<div v-for="(row, i) in form.state.agentLlmModelRows" :key="i" :class="[$style.modelCard, row.unlisted ? $style.modelCardUnlisted : null]" class="_gaps_s">
						<div :class="$style.modelCardHead">
							<span :class="$style.modelCardTitle">
								{{ i18n.ts._agents.adminModelRowPrefix }} #{{ i + 1 }}
								<span v-if="row.unlisted" :class="$style.unlistedBadge">{{ i18n.ts._agents.adminModelUnlistedBadge }}</span>
							</span>
							<div :class="$style.modelCardActions">
								<button v-if="row.unlisted" type="button" class="_button" :class="$style.iconMuted" :title="i18n.ts._agents.adminModelRelist" @click="toggleUnlist(i, false)">
									<i class="ti ti-eye"></i>
								</button>
								<button v-else type="button" class="_button" :class="$style.iconWarn" :title="i18n.ts._agents.adminModelUnlist" @click="toggleUnlist(i, true)">
									<i class="ti ti-archive"></i>
								</button>
							</div>
						</div>
						<MkInput v-model="row.name" :readonly="row.unlisted">
							<template #label>{{ i18n.ts._agents.modelDisplayName }}</template>
						</MkInput>
						<div v-if="row.id.trim() !== ''" :class="$style.internalIdRow">
							<span :class="$style.internalIdLabel">{{ i18n.ts._agents.fieldModelInternalId }}</span>
							<code :class="$style.internalIdValue">{{ row.id }}</code>
							<p :class="$style.internalIdCaption">{{ i18n.ts._agents.fieldModelInternalIdCaption }}</p>
						</div>
						<MkTextarea v-model="row.description" :readonly="row.unlisted">
							<template #label>{{ i18n.ts._agents.modelDescription }}</template>
						</MkTextarea>
						<MkInput v-model="row.baseUrl" type="text" :readonly="row.unlisted">
							<template #label>{{ i18n.ts._agents.modelBaseUrl }}</template>
							<template #caption>{{ i18n.ts._agents.fieldModelBaseUrlCaption }}</template>
							<template #prefix><i class="ti ti-link"></i></template>
						</MkInput>
						<MkInput v-model="row.apiKey" type="password" :readonly="row.unlisted">
							<template #label>{{ i18n.ts._agents.modelApiKey }}</template>
						</MkInput>
						<MkInput v-model="row.apiModelName" :readonly="row.unlisted">
							<template #label>{{ i18n.ts._agents.modelApiName }}</template>
							<template #caption>{{ i18n.ts._agents.fieldApiModelNameCaption }}</template>
						</MkInput>
						<FormSplit :minWidth="260">
							<MkInput v-model="row.maxContextTokens" type="text" :readonly="row.unlisted">
								<template #label>{{ i18n.ts._agents.maxContextTokens }}</template>
							</MkInput>
							<MkInput v-model="row.maxOutputTokensPerCall" type="text" :readonly="row.unlisted">
								<template #label>{{ i18n.ts._agents.maxOutputTokens }}</template>
							</MkInput>
						</FormSplit>
						<MkInput v-model="row.costPerCall" type="text" :readonly="row.unlisted">
							<template #label>{{ i18n.ts._agents.modelCostPerCall }}</template>
							<template #caption>{{ i18n.ts._agents.modelCostPerCallCaption }}</template>
							<template #prefix><i class="ti ti-coin"></i></template>
						</MkInput>
					</div>

					<div>
						<MkButton rounded @click="addRow"><i class="ti ti-plus"></i> {{ i18n.ts._agents.addAgentModel }}</MkButton>
					</div>

					<MkSelect v-model="form.state.agentDefaultModelId" :items="defaultModelItems">
						<template #label>{{ i18n.ts._agents.agentDefaultModelId }}</template>
					</MkSelect>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="false">
				<template #icon><i class="ti ti-brain"></i></template>
				<template #label>{{ i18n.ts._agents.adminSectionLongMemory }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.adminLongMemoryHint }}</MkInfo>
					<MkSwitch v-model="form.state.agentMem0Enabled">
						<template #label>{{ i18n.ts._agents.longMemoryEnabled }}</template>
					</MkSwitch>
					<MkInput v-model="form.state.agentMem0ApiKey" type="password">
						<template #label>{{ i18n.ts._agents.dashscopeApiKey }}</template>
						<template #caption>{{ i18n.ts._agents.dashscopeApiKeyCaption }}</template>
					</MkInput>
					<MkInput v-model="form.state.agentMem0ApiBaseUrl" type="text">
						<template #label>{{ i18n.ts._agents.dashscopeApiBaseUrl }}</template>
						<template #caption>{{ i18n.ts._agents.dashscopeApiBaseUrlCaption }}</template>
					</MkInput>
					<MkInput v-model="form.state.agentMem0OrgId" type="text">
						<template #label>{{ i18n.ts._agents.memoryLibraryId }}</template>
						<template #caption>{{ i18n.ts._agents.memoryLibraryIdCaption }}</template>
					</MkInput>
					<FormSplit :minWidth="260">
						<MkInput v-model="form.state.agentMem0TopK" type="text">
							<template #label>{{ i18n.ts._agents.defaultMemoryTopK }}</template>
						</MkInput>
						<MkInput v-model="form.state.agentMem0InjectMaxChars" type="text">
							<template #label>{{ i18n.ts._agents.defaultMemoryInjectMaxChars }}</template>
						</MkInput>
					</FormSplit>
					<MkInput v-model="form.state.agentMem0AddMemoryMaxRounds" type="text">
						<template #label>{{ i18n.ts._agents.defaultMemoryAddMaxRounds }}</template>
						<template #caption>{{ i18n.ts._agents.defaultMemoryAddMaxRoundsCaption }}</template>
					</MkInput>
					<MkInput v-model="form.state.agentMem0AddMemoryEveryNRounds" type="text">
						<template #label>{{ i18n.ts._agents.defaultMemoryAddEveryNRounds }}</template>
						<template #caption>{{ i18n.ts._agents.defaultMemoryAddEveryNRoundsCaption }}</template>
					</MkInput>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="false">
				<template #icon><i class="ti ti-file-zip"></i></template>
				<template #label>{{ i18n.ts._agents.adminSectionCompression }}</template>
				<div class="_gaps">
					<MkInfo>{{ i18n.ts._agents.adminCompressionHint }}</MkInfo>
					<MkTextarea v-model="form.state.agentCompressionSystemPrompt" tall>
						<template #label>{{ i18n.ts._agents.agentCompressionSystemPrompt }}</template>
						<template #caption>{{ i18n.ts._agents.agentCompressionSystemPromptCaption }}</template>
					</MkTextarea>
					<FormSplit :minWidth="260">
						<MkInput v-model="form.state.agentCompressionMaxInputChars" type="text">
							<template #label>{{ i18n.ts._agents.agentCompressionMaxInputChars }}</template>
							<template #caption>{{ i18n.ts._agents.agentCompressionMaxInputCharsCaption }}</template>
						</MkInput>
						<MkInput v-model="form.state.agentCompressionMaxOutputTokens" type="text">
							<template #label>{{ i18n.ts._agents.agentCompressionMaxOutputTokens }}</template>
							<template #caption>{{ i18n.ts._agents.agentCompressionMaxOutputTokensCaption }}</template>
						</MkInput>
					</FormSplit>
					<FormSplit :minWidth="200">
						<MkInput v-model="form.state.agentCompressionBandT1Ratio" type="text">
							<template #label>{{ i18n.ts._agents.agentCompressionBandT1Ratio }}</template>
							<template #caption>{{ i18n.ts._agents.agentCompressionBandT1RatioCaption }}</template>
						</MkInput>
						<MkInput v-model="form.state.agentCompressionBandT2Ratio" type="text">
							<template #label>{{ i18n.ts._agents.agentCompressionBandT2Ratio }}</template>
							<template #caption>{{ i18n.ts._agents.agentCompressionBandT2RatioCaption }}</template>
						</MkInput>
					</FormSplit>
					<MkSelect v-model="form.state.agentCompressionDefaultModelId" :items="compressionDefaultModelItems">
						<template #label>{{ i18n.ts._agents.adminCompressionDefaultModel }}</template>
						<template #caption>{{ i18n.ts._agents.adminCompressionDefaultModelCaption }}</template>
					</MkSelect>
					<MkInfo>{{ i18n.ts._agents.agentCompressionBandRatiosEmptyHint }}</MkInfo>
				</div>
			</MkFolder>

			<div v-if="form.modified.value" :class="$style.saveBar">
				<MkFormFooter :form="form"/>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import FormSplit from '@/components/form/split.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useForm } from '@/composables/use-form.js';
import { genId } from '@/utility/id.js';
import { useRouter } from '@/router.js';

const router = useRouter();

const meta = await misskeyApi('admin/meta') as Record<string, unknown>;

type AgentLlmModelRow = {
	id: string;
	name: string;
	description: string;
	baseUrl: string;
	apiKey: string;
	apiModelName: string;
	maxContextTokens: string;
	maxOutputTokensPerCall: string;
	unlisted: boolean;
	costPerCall: string;
};

function numFromMeta(v: unknown, fallback: number): number {
	if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
	const n = Number(v);
	return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function ratioFromMeta(v: unknown, fallback: number): string {
	if (v == null) return String(fallback);
	if (typeof v === 'number' && Number.isFinite(v)) return String(v);
	const n = Number(v);
	return Number.isFinite(n) ? String(n) : String(fallback);
}

function initAgentLlmModelRows(): AgentLlmModelRow[] {
	const raw = meta.agentLlmModels;
	if (raw == null || !Array.isArray(raw) || raw.length === 0) return [];
	const rows: AgentLlmModelRow[] = [];
	for (const item of raw) {
		if (typeof item !== 'object' || item == null) continue;
		const o = item as Record<string, unknown>;
		const idRaw = typeof o.id === 'string' ? o.id.trim() : '';
		const name = typeof o.name === 'string' ? o.name : '';
		const apiModelName = typeof o.apiModelName === 'string' ? o.apiModelName : '';
		if (!name.trim() || !apiModelName.trim()) continue;
		let description = '';
		if (typeof o.description === 'string') description = o.description;
		rows.push({
			id: idRaw || genId(),
			name,
			description,
			baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl : '',
			apiKey: typeof o.apiKey === 'string' ? o.apiKey : '',
			apiModelName,
			maxContextTokens: String(numFromMeta(o.maxContextTokens, 8192)),
			maxOutputTokensPerCall: String(numFromMeta(o.maxOutputTokensPerCall, 2048)),
			unlisted: o.unlisted === true,
			costPerCall: typeof o.costPerCall === 'number' && Number.isFinite(o.costPerCall) ? String(o.costPerCall) : '0',
		});
	}
	return rows;
}

function rowIsBlank(row: AgentLlmModelRow): boolean {
	return !row.name.trim() && !row.description.trim() && !row.baseUrl.trim()
		&& !row.apiKey.trim() && !row.apiModelName.trim();
}

const form = useForm({
	agentFeatureEnabled: Boolean(meta.agentFeatureEnabled),
	agentGlobalSystemPrompt: typeof meta.agentGlobalSystemPrompt === 'string' ? meta.agentGlobalSystemPrompt : '',
	agentLlmModelRows: initAgentLlmModelRows(),
	agentDefaultModelId: typeof meta.agentDefaultModelId === 'string' ? meta.agentDefaultModelId : '',
	agentMem0Enabled: Boolean(meta.agentMem0Enabled),
	agentMem0ApiKey: typeof meta.agentMem0ApiKey === 'string' ? meta.agentMem0ApiKey : '',
	agentMem0ApiBaseUrl: typeof meta.agentMem0ApiBaseUrl === 'string' ? meta.agentMem0ApiBaseUrl : '',
	agentMem0OrgId: typeof meta.agentMem0OrgId === 'string' ? meta.agentMem0OrgId : '',
	agentMem0TopK: String(numFromMeta(meta.agentMem0TopK, 8)),
	agentMem0InjectMaxChars: String(numFromMeta(meta.agentMem0InjectMaxChars, 4000)),
	agentMem0AddMemoryMaxRounds: String(numFromMeta(meta.agentMem0AddMemoryMaxRounds, 3)),
	agentMem0AddMemoryEveryNRounds: String(numFromMeta(meta.agentMem0AddMemoryEveryNRounds, 1)),
	agentCompressionSystemPrompt: typeof meta.agentCompressionSystemPrompt === 'string' ? meta.agentCompressionSystemPrompt : '',
	agentCompressionMaxInputChars: String(numFromMeta(meta.agentCompressionMaxInputChars, 12000)),
	agentCompressionMaxOutputTokens: String(numFromMeta(meta.agentCompressionMaxOutputTokens, 2048)),
	agentCompressionBandT1Ratio: ratioFromMeta((meta as Record<string, unknown>).agentCompressionBandT1Ratio, 0.8),
	agentCompressionBandT2Ratio: ratioFromMeta((meta as Record<string, unknown>).agentCompressionBandT2Ratio, 0.9),
	agentCompressionDefaultModelId: typeof (meta as Record<string, unknown>).agentCompressionDefaultModelId === 'string'
		? String((meta as Record<string, unknown>).agentCompressionDefaultModelId)
		: '',
}, async (state) => {
	type Normalized = {
		id: string;
		name: string;
		description: string | null;
		baseUrl: string;
		apiKey: string;
		apiModelName: string;
		maxContextTokens: number;
		maxOutputTokensPerCall: number;
		unlisted: boolean;
		costPerCall: number;
	};
	const normalized: Normalized[] = [];
	const seen = new Set<string>();
	for (const row of state.agentLlmModelRows) {
		if (rowIsBlank(row)) continue;
		let id = row.id.trim();
		if (!id) {
			id = genId();
			row.id = id;
		}
		const name = row.name.trim();
		const baseUrl = row.baseUrl.trim();
		const apiKey = row.apiKey.trim();
		const apiModelName = row.apiModelName.trim();
		const descRaw = row.description.trim();
		const maxCtx = Math.trunc(Number(row.maxContextTokens));
		const maxOut = Math.trunc(Number(row.maxOutputTokensPerCall));
		if (!name || !baseUrl || !apiKey || !apiModelName) {
			os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsRowIncomplete });
			throw new Error('incomplete model row');
		}
		if (seen.has(id)) {
			os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsDuplicateId });
			throw new Error('duplicate model id');
		}
		seen.add(id);
		if (!Number.isFinite(maxCtx) || maxCtx < 256 || maxCtx > 2_000_000) {
			os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsInvalidContext });
			throw new Error('invalid context');
		}
		if (!Number.isFinite(maxOut) || maxOut < 1 || maxOut > 128_000) {
			os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsInvalidOutput });
			throw new Error('invalid output');
		}
		const costRaw = row.costPerCall.trim();
		const cost = costRaw === '' ? 0 : Number(costRaw);
		if (!Number.isFinite(cost) || cost < 0 || cost > 1_000_000) {
			os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsInvalidCost });
			throw new Error('invalid cost');
		}
		normalized.push({
			id,
			name,
			description: descRaw === '' ? null : descRaw,
			baseUrl,
			apiKey,
			apiModelName,
			maxContextTokens: maxCtx,
			maxOutputTokensPerCall: maxOut,
			unlisted: row.unlisted === true,
			costPerCall: cost,
		});
	}
	if (normalized.length === 0) {
		os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsNeedOne });
		throw new Error('no models');
	}
	const defTrim = state.agentDefaultModelId.trim();
	if (defTrim !== '' && !normalized.some(m => m.id === defTrim && !m.unlisted)) {
		os.alert({ type: 'error', text: i18n.ts._agents.agentDefaultModelInvalid });
		throw new Error('invalid default model');
	}

	const compDefTrim = state.agentCompressionDefaultModelId.trim();
	if (compDefTrim !== '' && !normalized.some(m => m.id === compDefTrim && !m.unlisted)) {
		os.alert({ type: 'error', text: i18n.ts._agents.agentDefaultModelInvalid });
		throw new Error('invalid compression default model');
	}

	const memTopK = Math.trunc(Number(state.agentMem0TopK));
	const memInj = Math.trunc(Number(state.agentMem0InjectMaxChars));
	if (!Number.isFinite(memTopK) || memTopK < 1 || memTopK > 100) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminLongMemoryInvalidTopK });
		throw new Error('invalid memory top k');
	}
	if (!Number.isFinite(memInj) || memInj < 200 || memInj > 50000) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminLongMemoryInvalidInject });
		throw new Error('invalid memory inject');
	}
	const memAddRounds = Math.trunc(Number(state.agentMem0AddMemoryMaxRounds));
	if (!Number.isFinite(memAddRounds) || memAddRounds < 1 || memAddRounds > 24) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminLongMemoryInvalidAddRounds });
		throw new Error('invalid add memory rounds');
	}
	const memAddEveryN = Math.trunc(Number(state.agentMem0AddMemoryEveryNRounds));
	if (!Number.isFinite(memAddEveryN) || memAddEveryN < 1 || memAddEveryN > 48) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminLongMemoryInvalidAddEveryN });
		throw new Error('invalid add memory every n');
	}

	const compMaxIn = Math.trunc(Number(state.agentCompressionMaxInputChars));
	const compMaxOut = Math.trunc(Number(state.agentCompressionMaxOutputTokens));
	if (!Number.isFinite(compMaxIn) || compMaxIn < 500 || compMaxIn > 200000) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminCompressionInvalidInput });
		throw new Error('invalid compression max input');
	}
	if (!Number.isFinite(compMaxOut) || compMaxOut < 1 || compMaxOut > 32000) {
		os.alert({ type: 'error', text: i18n.ts._agents.adminCompressionInvalidOutput });
		throw new Error('invalid compression max output');
	}

	const t1s = String(state.agentCompressionBandT1Ratio ?? '').trim();
	const t2s = String(state.agentCompressionBandT2Ratio ?? '').trim();
	let bandT1: number | null = null;
	let bandT2: number | null = null;
	if (t1s === '' && t2s === '') {
		bandT1 = null;
		bandT2 = null;
	} else {
		bandT1 = Number(t1s);
		bandT2 = Number(t2s);
		if (!Number.isFinite(bandT1) || !Number.isFinite(bandT2) || bandT1 < 0.01 || bandT1 > 0.99 || bandT2 < 0.01 || bandT2 > 0.99) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminCompressionInvalidBandRatio });
			throw new Error('invalid band ratio');
		}
		if (bandT1 >= bandT2) {
			os.alert({ type: 'error', text: i18n.ts._agents.adminCompressionInvalidBandT1T2 });
			throw new Error('invalid t1 t2 order');
		}
	}

	await os.apiWithDialog('admin/update-meta', {
		agentFeatureEnabled: state.agentFeatureEnabled,
		agentGlobalSystemPrompt: state.agentGlobalSystemPrompt === '' ? null : state.agentGlobalSystemPrompt,
		agentLlmModels: normalized,
		agentDefaultModelId: defTrim === '' ? null : defTrim,
		agentOpenaiCompatibleBaseUrl: null,
		agentOpenaiCompatibleApiKey: null,
		agentModelDisplayName: null,
		agentModelDescription: null,
		agentModelApiName: null,
		agentMem0Enabled: state.agentMem0Enabled,
		agentMem0ApiKey: state.agentMem0ApiKey.trim() === '' ? null : state.agentMem0ApiKey,
		agentMem0ApiBaseUrl: state.agentMem0ApiBaseUrl.trim() === '' ? null : state.agentMem0ApiBaseUrl.trim(),
		agentMem0OrgId: state.agentMem0OrgId.trim() === '' ? null : state.agentMem0OrgId.trim(),
		agentMem0TopK: memTopK,
		agentMem0InjectMaxChars: memInj,
		agentMem0AddMemoryMaxRounds: memAddRounds,
		agentMem0AddMemoryEveryNRounds: memAddEveryN,
		agentCompressionSystemPrompt: state.agentCompressionSystemPrompt.trim() === '' ? null : state.agentCompressionSystemPrompt,
		agentCompressionMaxInputChars: compMaxIn,
		agentCompressionMaxOutputTokens: compMaxOut,
		agentCompressionBandT1Ratio: bandT1,
		agentCompressionBandT2Ratio: bandT2,
		agentCompressionDefaultModelId: compDefTrim === '' ? null : compDefTrim,
	} as Record<string, unknown>);
	fetchInstance(true);
});

const defaultModelItems = computed((): MkSelectItem[] => {
	const items: MkSelectItem[] = [{ value: '', label: i18n.ts._agents.agentsMetaDefaultModelUnset }];
	const seen = new Set<string>();
	for (const row of form.state.agentLlmModelRows) {
		if (row.unlisted) continue;
		const id = row.id.trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const label = row.name.trim() || id;
		items.push({ value: id, label });
	}
	return items;
});

const compressionDefaultModelItems = computed((): MkSelectItem[] => {
	const items: MkSelectItem[] = [{ value: '', label: i18n.ts._agents.agentsMetaDefaultModelUnset }];
	const seen = new Set<string>();
	for (const row of form.state.agentLlmModelRows) {
		if (row.unlisted) continue;
		const id = row.id.trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		items.push({ value: id, label: row.name.trim() || id });
	}
	return items;
});

function addRow() {
	form.state.agentLlmModelRows.push({
		id: genId(),
		name: '',
		description: '',
		baseUrl: '',
		apiKey: '',
		apiModelName: '',
		maxContextTokens: '8192',
		maxOutputTokensPerCall: '2048',
		unlisted: false,
		costPerCall: '0',
	});
}

async function toggleUnlist(index: number, next: boolean) {
	const row = form.state.agentLlmModelRows[index];
	if (next === true) {
		const ok = await os.confirm({
			type: 'warning',
			text: i18n.tsx._agents.adminModelUnlistConfirm({ name: row.name.trim() || row.id }),
		});
		if (ok.canceled) return;
		if (form.state.agentDefaultModelId.trim() === row.id.trim()) {
			form.state.agentDefaultModelId = '';
		}
		if (form.state.agentCompressionDefaultModelId.trim() === row.id.trim()) {
			form.state.agentCompressionDefaultModelId = '';
		}
	}
	row.unlisted = next;
}

const headerTabs = computed(() => []);

const headerActions = computed(() => [{
	icon: 'ti ti-report-analytics',
	text: '请求报表',
	handler: () => router.push('/admin/agents-reports' as any),
}]);

definePage(() => ({
	title: i18n.ts._agents.adminSettings,
	icon: 'ti ti-robot',
}));
</script>

<style lang="scss" module>
.modelCard {
	padding: 14px 16px;
	border-radius: 12px;
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}

.modelCardHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 2px;
}

.modelCardTitle {
	font-size: 0.92em;
	font-weight: 600;
	opacity: 0.9;
}

.iconDanger {
	color: var(--MI_THEME-error);

	&:hover {
		opacity: 0.85;
	}
}

.iconWarn {
	color: var(--MI_THEME-warn);

	&:hover {
		opacity: 0.85;
	}
}

.iconMuted {
	color: var(--MI_THEME-fg);
	opacity: 0.72;

	&:hover {
		opacity: 1;
	}
}

.modelCardUnlisted {
	opacity: 0.82;
	background: color-mix(in srgb, var(--MI_THEME-panel) 85%, var(--MI_THEME-warn) 15%);
}

.modelCardActions {
	display: flex;
	gap: 4px;
	align-items: center;
}

.unlistedBadge {
	margin-left: 8px;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.75em;
	font-weight: 600;
	background: var(--MI_THEME-warn);
	color: var(--MI_THEME-fgOnWarn, #fff);
}

.emptyModels {
	text-align: center;
	padding: 20px 12px;
	font-size: 0.92em;
	opacity: 0.72;
	border-radius: 12px;
	border: 1px dashed var(--MI_THEME-divider);
}

.internalIdRow {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
}

.internalIdLabel {
	font-size: 0.78em;
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	opacity: 0.55;
}

.internalIdValue {
	font-size: 0.88em;
	word-break: break-all;
}

.internalIdCaption {
	margin: 0;
	font-size: 0.82em;
	opacity: 0.72;
	line-height: 1.45;
}

.saveBar {
	position: sticky;
	bottom: max(12px, env(safe-area-inset-bottom, 0px));
	padding: 12px 0 4px;
	margin-top: 8px;
	background: linear-gradient(to top, var(--MI_THEME-bg) 70%, transparent);
}
</style>
