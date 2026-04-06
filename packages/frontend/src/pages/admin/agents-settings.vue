<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
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

					<div v-for="(row, i) in form.state.agentLlmModelRows" :key="i" :class="$style.modelCard" class="_gaps_s">
						<div :class="$style.modelCardHead">
							<span :class="$style.modelCardTitle">{{ i18n.ts._agents.adminModelRowPrefix }} #{{ i + 1 }}</span>
							<button type="button" class="_button" :class="$style.iconDanger" :title="i18n.ts.remove" @click="removeRow(i)">
								<i class="ti ti-trash"></i>
							</button>
						</div>
						<MkInput v-model="row.name">
							<template #label>{{ i18n.ts._agents.modelDisplayName }}</template>
						</MkInput>
						<div v-if="row.id.trim() !== ''" :class="$style.internalIdRow">
							<span :class="$style.internalIdLabel">{{ i18n.ts._agents.fieldModelInternalId }}</span>
							<code :class="$style.internalIdValue">{{ row.id }}</code>
							<p :class="$style.internalIdCaption">{{ i18n.ts._agents.fieldModelInternalIdCaption }}</p>
						</div>
						<MkTextarea v-model="row.description">
							<template #label>{{ i18n.ts._agents.modelDescription }}</template>
						</MkTextarea>
						<MkInput v-model="row.baseUrl" type="text">
							<template #label>{{ i18n.ts._agents.modelBaseUrl }}</template>
							<template #caption>{{ i18n.ts._agents.fieldModelBaseUrlCaption }}</template>
							<template #prefix><i class="ti ti-link"></i></template>
						</MkInput>
						<MkInput v-model="row.apiKey" type="password">
							<template #label>{{ i18n.ts._agents.modelApiKey }}</template>
						</MkInput>
						<MkInput v-model="row.apiModelName">
							<template #label>{{ i18n.ts._agents.modelApiName }}</template>
							<template #caption>{{ i18n.ts._agents.fieldApiModelNameCaption }}</template>
						</MkInput>
						<FormSplit :minWidth="260">
							<MkInput v-model="row.maxContextTokens" type="text">
								<template #label>{{ i18n.ts._agents.maxContextTokens }}</template>
							</MkInput>
							<MkInput v-model="row.maxOutputTokensPerCall" type="text">
								<template #label>{{ i18n.ts._agents.maxOutputTokens }}</template>
							</MkInput>
						</FormSplit>
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
};

function numFromMeta(v: unknown, fallback: number): number {
	if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
	const n = Number(v);
	return Number.isFinite(n) ? Math.trunc(n) : fallback;
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
		normalized.push({
			id,
			name,
			description: descRaw === '' ? null : descRaw,
			baseUrl,
			apiKey,
			apiModelName,
			maxContextTokens: maxCtx,
			maxOutputTokensPerCall: maxOut,
		});
	}
	if (normalized.length === 0) {
		os.alert({ type: 'error', text: i18n.ts._agents.agentLlmModelsNeedOne });
		throw new Error('no models');
	}
	const defTrim = state.agentDefaultModelId.trim();
	if (defTrim !== '' && !normalized.some(m => m.id === defTrim)) {
		os.alert({ type: 'error', text: i18n.ts._agents.agentDefaultModelInvalid });
		throw new Error('invalid default model');
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
	} as Record<string, unknown>);
	fetchInstance(true);
});

const defaultModelItems = computed((): MkSelectItem[] => {
	const items: MkSelectItem[] = [{ value: '', label: i18n.ts._agents.agentsMetaDefaultModelUnset }];
	const seen = new Set<string>();
	for (const row of form.state.agentLlmModelRows) {
		const id = row.id.trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const label = row.name.trim() || id;
		items.push({ value: id, label });
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
	});
}

function removeRow(index: number) {
	form.state.agentLlmModelRows.splice(index, 1);
}

const headerTabs = computed(() => []);

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
