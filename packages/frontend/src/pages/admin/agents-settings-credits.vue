<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkFolder :defaultOpen="true">
		<template #icon><i class="ti ti-plus"></i></template>
		<template #label>{{ i18n.ts._agents.redeemCodesGenerate }}</template>
		<div class="_gaps">
			<FormSplit :minWidth="220">
				<MkInput v-model="redeemForm.amount" type="number" :min="0.0001">
					<template #label>{{ i18n.ts._agents.redeemCodesAmount }}</template>
				</MkInput>
				<MkInput v-model="redeemForm.count" type="number" :min="1" :max="100">
					<template #label>{{ i18n.ts._agents.redeemCodesCount }}</template>
				</MkInput>
			</FormSplit>
			<MkInput v-model="redeemForm.note" type="text">
				<template #label>{{ i18n.ts._agents.redeemCodesNote }}</template>
			</MkInput>
			<MkInput v-model="redeemForm.expiresAt" type="datetime-local">
				<template #label>{{ i18n.ts._agents.redeemCodesExpires }}</template>
			</MkInput>
			<div class="_buttons">
				<MkButton primary rounded :disabled="redeemGenerating" @click="emit('generate')"><i class="ti ti-plus"></i> {{ i18n.ts._agents.redeemCodesGenerateBtn }}</MkButton>
				<MkButton rounded :disabled="redeemLoading" @click="emit('refresh')"><i class="ti ti-refresh"></i> 刷新列表</MkButton>
			</div>
			<div v-if="generatedCodes.length > 0" :class="$style.generatedBox">
				<div :class="$style.generatedHead">
					<b>{{ i18n.ts._agents.redeemCodesGenerated }}</b>
					<MkButton small rounded @click="copyGeneratedCodes"><i class="ti ti-copy"></i> {{ i18n.ts._agents.redeemCodesCopyAll }}</MkButton>
				</div>
				<code v-for="c in generatedCodes" :key="c.id" :class="$style.generatedCode">{{ c.code }} · {{ c.creditAmount }}</code>
			</div>
		</div>
	</MkFolder>

	<MkFolder :defaultOpen="true">
		<template #icon><i class="ti ti-link"></i></template>
		<template #label>{{ i18n.ts._agents.redeemPurchaseUrl }}</template>
		<div class="_gaps">
			<MkInput v-model="purchaseUrl" type="url">
				<template #label>{{ i18n.ts._agents.redeemPurchaseUrl }}</template>
				<template #caption>{{ i18n.ts._agents.redeemPurchaseUrlCaption }}</template>
			</MkInput>
		</div>
	</MkFolder>

	<MkFolder :defaultOpen="true">
		<template #icon><i class="ti ti-list"></i></template>
		<template #label>{{ i18n.ts._agents.redeemCodesList }}</template>
		<div class="_gaps">
			<div :class="$style.filterRow">
				<MkSelect v-model="status" :items="redeemStatusItems" small>
					<template #label>{{ i18n.ts._agents.redeemCodesFilterStatus }}</template>
				</MkSelect>
				<MkInput v-model="query" type="text" small :class="$style.searchInput">
					<template #label>{{ i18n.ts._agents.redeemCodesSearch }}</template>
					<template #prefix><i class="ti ti-search"></i></template>
				</MkInput>
				<MkButton small rounded :disabled="redeemLoading" @click="emit('refresh')"><i class="ti ti-refresh"></i></MkButton>
			</div>

			<MkLoading v-if="redeemLoading && redeemCodes.length === 0"/>
			<div v-else-if="redeemCodes.length === 0" :class="$style.emptyMsg">{{ i18n.ts._agents.redeemCodesEmpty }}</div>

			<div v-if="redeemCodes.length > 0" :class="$style.redeemTable">
				<div :class="$style.redeemHead">
					<span :class="$style.colCreatedAt">{{ i18n.ts._agents.redeemCodesColCreatedAt }}</span>
					<span :class="$style.colCode">{{ i18n.ts._agents.redeemCodesColCode }}</span>
					<span :class="$style.colAmount">{{ i18n.ts._agents.redeemCodesAmount }}</span>
					<span :class="$style.colStatus">{{ i18n.ts._agents.redeemCodesColStatus }}</span>
					<span :class="$style.colNote">{{ i18n.ts._agents.redeemCodesNote }}</span>
					<span :class="$style.colUser">{{ i18n.ts._agents.redeemCodesColUser }}</span>
					<span :class="$style.colActions"></span>
				</div>
				<div v-for="row in redeemCodes" :key="row.id" :class="$style.redeemRow">
					<span :class="$style.colCreatedAt">{{ formatBjt(row.createdAt) }}</span>
					<code :class="$style.colCode">{{ row.code }}</code>
					<span :class="$style.colAmount">{{ row.creditAmount }}</span>
					<span :class="$style.colStatus" :style="{ color: redeemStatusColor(row.status) }">{{ redeemStatusLabel(row.status) }}</span>
					<span :class="$style.colNote" :title="row.note">{{ row.note || '—' }}</span>
					<span :class="$style.colUser">
						<template v-if="row.redeemedBy">
							<MkA :to="`/admin/user/${row.redeemedBy.id}`" :class="$style.userLink">
								<MkUserName :user="row.redeemedBy"/>
								<MkAcct :user="row.redeemedBy" :class="$style.userAcct"/>
							</MkA>
							<button
								type="button"
								class="_button"
								:class="$style.userCopyBtn"
								:title="i18n.ts.copy"
								:aria-label="i18n.ts.copy"
								@click="copyAcct(row.redeemedBy)"
							>
								<i class="ti ti-copy"></i>
							</button>
						</template>
						<template v-else>—</template>
					</span>
					<span :class="$style.colActions">
						<button v-if="row.status === 'available'" type="button" class="_button" :class="$style.revokeBtn" :disabled="redeemRevoking" @click="emit('revoke', row)">
							<i class="ti ti-ban"></i>
							<span>{{ i18n.ts._agents.redeemCodesRevoke }}</span>
						</button>
					</span>
				</div>
			</div>
			<div v-if="redeemCodes.length > 0" :class="$style.pagerBar" role="navigation" :aria-label="i18n.ts._agents.redeemCodesList">
				<div :class="$style.pagerSegGroup" :aria-label="i18n.ts._agents.pageSize" role="group">
					<button
						v-for="size in redeemPageSizeOptions"
						:key="`redeem-${size}`"
						type="button"
						class="_button"
						:class="[$style.pagerSegBtn, pageSize === size ? $style.pagerSegBtnActive : null]"
						@click="pageSize = size"
					>
						{{ size }}
					</button>
				</div>
				<div :class="$style.pagerNavGroup" role="group">
					<button
						type="button"
						class="_button"
						:class="$style.pagerNavIconBtn"
						:disabled="listPage <= 1 || redeemLoading"
						:aria-label="i18n.ts._agents.sessionMemoryPrevPage"
						@click="emit('goPage', listPage - 1)"
					>
						<i class="ti ti-chevron-left" aria-hidden="true"></i>
					</button>
					<span :class="$style.pagerNavText">{{ listPage }}</span>
					<button
						type="button"
						class="_button"
						:class="$style.pagerNavIconBtn"
						:disabled="!hasNext || redeemLoading"
						:aria-label="i18n.ts._agents.sessionMemoryNextPage"
						@click="emit('goPage', listPage + 1)"
					>
						<i class="ti ti-chevron-right" aria-hidden="true"></i>
					</button>
				</div>
				<div :class="$style.pagerGoGroup" role="group" :aria-label="i18n.ts._agents.pageJump">
					<div :class="$style.pagerGoInputCell">
						<input
							type="number"
							inputmode="numeric"
							:min="1"
							:value="pageInput"
							:disabled="redeemLoading"
							:class="$style.pagerGoNativeInput"
							:aria-label="i18n.ts._agents.pageJump"
							@input="syncPagerInput"
							@keydown.enter.prevent="emit('goInputPage')"
						/>
					</div>
					<button
						type="button"
						class="_button"
						:class="$style.pagerGoJumpBtn"
						:disabled="redeemLoading"
						@click="emit('goInputPage')"
					>
						{{ i18n.ts._agents.pageJump }}
					</button>
				</div>
			</div>
		</div>
	</MkFolder>
</div>
</template>

<script lang="ts" setup>
import type { MkSelectItem } from '@/components/MkSelect.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkAcct from '@/components/global/MkAcct.vue';
import MkA from '@/components/global/MkA.vue';
import FormSplit from '@/components/form/split.vue';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';

/** Redeem code row (admin/agents/redeem-codes/list) */
export type RedeemCodeRow = {
	id: string;
	createdAt: string;
	code: string;
	creditAmount: number;
	note: string;
	expiresAt: string | null;
	redeemedAt: string | null;
	redeemedBy: any | null;
	revoked: boolean;
	status: 'available' | 'redeemed' | 'expired' | 'revoked';
};

export type RedeemFormState = {
	amount: number;
	count: number;
	note: string;
	expiresAt: string;
};

/**
 * Credits panel (redeem code management). Presentational only: list
 * fetching/caching, pager navigation and API calls stay in
 * agents-settings.vue; filter/page state is forwarded via v-model so the
 * parent watchers keep driving reloads. Reward/compensation issuing lives in
 * the self-contained agents-settings-credit-grants.vue.
 */
const props = defineProps<{
	redeemForm: RedeemFormState;
	redeemGenerating: boolean;
	generatedCodes: { id: string; code: string; creditAmount: number }[];
	redeemLoading: boolean;
	redeemCodes: RedeemCodeRow[];
	redeemRevoking: boolean;
	hasNext: boolean;
	listPage: number;
}>();

const emit = defineEmits<{
	(ev: 'generate'): void;
	(ev: 'refresh'): void;
	(ev: 'revoke', row: RedeemCodeRow): void;
	(ev: 'goPage', page: number): void;
	(ev: 'goInputPage'): void;
}>();

const status = defineModel<'available' | 'redeemed' | 'expired' | 'revoked' | 'all'>('status', { required: true });
const query = defineModel<string>('query', { required: true });
const pageSize = defineModel<number>('pageSize', { required: true });
const pageInput = defineModel<string>('pageInput', { required: true });
/** Stored on the shared admin form state by the parent (save bar reacts to it) */
const purchaseUrl = defineModel<string>('purchaseUrl', { required: true });

const redeemStatusItems: MkSelectItem[] = [
	{ value: 'all', label: '全部' },
	{ value: 'available', label: '可用' },
	{ value: 'redeemed', label: '已兑换' },
	{ value: 'expired', label: '已过期' },
	{ value: 'revoked', label: '已撤销' },
];

const redeemPageSizeOptions = [10, 20, 50] as const;

function syncPagerInput(ev: Event) {
	pageInput.value = (ev.target as HTMLInputElement).value;
}

function copyGeneratedCodes() {
	copyToClipboard(props.generatedCodes.map(c => c.code).join('\n'));
}

function copyAcct(user: NonNullable<RedeemCodeRow['redeemedBy']>) {
	copyToClipboard(`@${user.username}${user.host ? `@${user.host}` : ''}`);
}

function formatBjt(iso: string): string {
	return new Date(iso).toLocaleString('zh-CN', {
		timeZone: 'Asia/Shanghai',
		hour12: false,
	});
}

function redeemStatusLabel(codeStatus: RedeemCodeRow['status']) {
	if (codeStatus === 'available') return i18n.ts._agents.adminRedeemAvailable;
	if (codeStatus === 'redeemed') return i18n.ts._agents.adminRedeemRedeemed;
	if (codeStatus === 'expired') return i18n.ts._agents.adminRedeemExpired;
	return i18n.ts._agents.adminRedeemRevoked;
}

function redeemStatusColor(codeStatus: RedeemCodeRow['status']) {
	if (codeStatus === 'available') return 'var(--MI_THEME-accent)';
	if (codeStatus === 'expired') return 'var(--MI_THEME-warn)';
	if (codeStatus === 'revoked') return 'var(--MI_THEME-error)';
	return 'var(--MI_THEME-fgTransparentWeak)';
}
</script>

<style lang="scss" module>
/* 卡密列表（自 agents-redeem-codes.vue 合并，与 my-stats.vue 分页条规范一致） */
.filterRow {
	display: flex;
	align-items: flex-end;
	flex-wrap: wrap;
	gap: 10px;
}
.searchInput {
	flex: 1;
	min-width: 180px;
}
.emptyMsg {
	text-align: center;
	padding: 20px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}
/*
 * 表级单一 grid + 行 display:contents：列宽按全表内容 max-content 计算并跨行对齐，
 * 内容超宽时整个表格横向滚动，任何情况下都不截断省略。
 */
.redeemTable {
	display: grid;
	grid-template-columns: max-content minmax(max-content, 1fr) max-content max-content minmax(max-content, 0.7fr) minmax(max-content, 0.9fr) max-content;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	overflow-x: auto;
	overflow-y: hidden;
}
.redeemHead,
.redeemRow {
	display: contents;
}
.redeemHead > *,
.redeemRow > * {
	display: flex;
	align-items: center;
	padding: 8px 4px;
	white-space: nowrap;
}
.redeemHead > *:first-child,
.redeemRow > *:first-child {
	padding-left: 12px;
}
.redeemHead > *:last-child,
.redeemRow > *:last-child {
	padding-right: 12px;
}
.redeemHead {
	font-size: 0.78em;
}
.redeemHead > * {
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
	background: var(--MI_THEME-bg);
}
.redeemRow {
	font-size: 0.83em;
}
.redeemRow > * {
	border-top: solid 1px var(--MI_THEME-divider);
}
.redeemRow:hover > * {
	background: color-mix(in srgb, var(--MI_THEME-accent) 3%, transparent);
}
.colCreatedAt {
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.86em;
}
.colCode {
	font-size: 0.88em;
	letter-spacing: 0.02em;
}
.colAmount {
	justify-content: flex-end;
	font-variant-numeric: tabular-nums;
	font-weight: 600;
}
.colStatus {
	justify-content: center;
	font-weight: 600;
	font-size: 0.85em;
}
.colNote {
	justify-content: center;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.88em;
}
.colUser {
	justify-content: center;
	gap: 4px;
}
.colActions {
	justify-content: flex-end;
}
.revokeBtn {
	white-space: nowrap;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 4px 8px;
	height: 26px;
	border-radius: 6px;
	font-size: 0.76em;
	font-weight: 600;
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 12%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-error) 35%, var(--MI_THEME-divider));
	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-error) 18%, transparent);
	}
}

/* 分页条（与 my-stats.vue 一致：native input，三无盒和左中栏对齐） */
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

.generatedBox {
	padding: 12px;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
}

.generatedHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	margin-bottom: 10px;
}

.generatedCode {
	display: block;
	padding: 8px 10px;
	border-radius: 6px;
	background: var(--MI_THEME-bg);
	word-break: break-all;

	& + & {
		margin-top: 6px;
	}
}

.userLink {
	display: inline-flex;
	align-items: baseline;
	gap: 4px;
	white-space: nowrap;
}

.userAcct {
	flex-shrink: 0;
	font-size: 0.88em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.userCopyBtn {
	flex-shrink: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 22px;
	height: 22px;
	border-radius: 4px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	&:hover {
		color: var(--MI_THEME-accent);
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}
}

@media (max-width: 800px) {
	.generatedHead {
		align-items: flex-start;
		flex-direction: column;
	}
}
</style>
