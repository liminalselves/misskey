<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 920px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<SearchMarker
			path="/admin/agents-redeem-codes"
			:label="i18n.ts._agents.redeemCodesManage"
			:keywords="['agents', 'redeem', 'code', 'credit', '卡密', '额度', '兑换']"
			icon="ti ti-ticket"
		>
			<div class="_gaps_m">
				<MkInfo>{{ i18n.ts._agents.redeemCodesManageDescription }}</MkInfo>

				<!-- 生成卡密 -->
				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-plus"></i></template>
					<template #label>{{ i18n.ts._agents.redeemCodesGenerate }}</template>
					<div class="_gaps">
						<FormSplit :minWidth="200">
							<MkInput v-model="genAmount" type="number" :min="0.0001" :max="1000000">
								<template #label>{{ i18n.ts._agents.redeemCodesAmount }}</template>
								<template #caption>{{ i18n.ts._agents.redeemCodesAmountCaption }}</template>
							</MkInput>
							<MkInput v-model="genCount" type="number" :min="1" :max="100">
								<template #label>{{ i18n.ts._agents.redeemCodesCount }}</template>
							</MkInput>
						</FormSplit>
						<MkInput v-model="genNote" type="text">
							<template #label>{{ i18n.ts._agents.redeemCodesNote }}</template>
							<template #caption>{{ i18n.ts._agents.redeemCodesNoteCaption }}</template>
						</MkInput>
						<MkInput v-model="genExpiresAt" type="datetime-local">
							<template #label>{{ i18n.ts._agents.redeemCodesExpires }}</template>
							<template #caption>{{ i18n.ts._agents.redeemCodesExpiresCaption }}</template>
						</MkInput>
						<div class="_buttons">
							<MkButton primary rounded :disabled="generating || !genAmountValid" @click="generate">
								<i class="ti ti-plus"></i> {{ i18n.ts._agents.redeemCodesGenerateBtn }}
							</MkButton>
						</div>

						<!-- 生成结果 -->
						<div v-if="generated.length > 0" :class="$style.generatedBox">
							<div :class="$style.generatedHead">
								<span :class="$style.generatedTitle">{{ i18n.ts._agents.redeemCodesGenerated }}</span>
								<MkButton small rounded @click="copyAllCodes"><i class="ti ti-copy"></i> {{ i18n.ts._agents.redeemCodesCopyAll }}</MkButton>
							</div>
							<div :class="$style.codeList">
								<div v-for="c in generated" :key="c.id" :class="$style.codeItem">
									<code :class="$style.codeText">{{ c.code }}</code>
									<span :class="$style.codeAmount">{{ c.creditAmount }}</span>
									<button type="button" class="_button" :class="$style.codeCopy" @click="copyOne(c.code)"><i class="ti ti-copy"></i></button>
								</div>
							</div>
						</div>
					</div>
				</MkFolder>

				<!-- 卡密列表 -->
				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-list"></i></template>
					<template #label>{{ i18n.ts._agents.redeemCodesList }}</template>
					<div class="_gaps">
						<div :class="$style.filterRow">
							<MkSelect v-model="filterStatus" :items="statusItems" small>
								<template #label>{{ i18n.ts._agents.redeemCodesFilterStatus }}</template>
							</MkSelect>
							<MkButton small rounded :disabled="listLoading" @click="loadList(true)"><i class="ti ti-refresh"></i></MkButton>
						</div>

						<MkLoading v-if="listLoading && listItems.length === 0"/>
						<div v-else-if="listItems.length === 0" :class="$style.emptyMsg">{{ i18n.ts._agents.redeemCodesEmpty }}</div>

						<div v-if="listItems.length > 0" :class="$style.table">
							<div :class="$style.tableHead">
								<span :class="$style.colCreatedAt">{{ i18n.ts._agents.redeemCodesColCreatedAt }}</span>
								<span :class="$style.colCode">{{ i18n.ts._agents.redeemCodesColCode }}</span>
								<span :class="$style.colAmount">{{ i18n.ts._agents.redeemCodesAmount }}</span>
								<span :class="$style.colStatus">{{ i18n.ts._agents.redeemCodesColStatus }}</span>
								<span :class="$style.colNote">{{ i18n.ts._agents.redeemCodesNote }}</span>
								<span :class="$style.colUser">{{ i18n.ts._agents.redeemCodesColUser }}</span>
								<span :class="$style.colActions"></span>
							</div>
							<div v-for="row in listItems" :key="row.id" :class="$style.tableRow">
								<span :class="$style.colCreatedAt">{{ formatBjt(row.createdAt) }}</span>
								<code :class="$style.colCode">{{ row.code }}</code>
								<span :class="$style.colAmount">{{ row.creditAmount }}</span>
								<span :class="$style.colStatus" :style="{ color: statusColor(row.status) }">{{ statusLabel(row.status) }}</span>
								<span :class="$style.colNote" :title="row.note">{{ row.note || '—' }}</span>
								<span :class="$style.colUser">
									<template v-if="row.redeemedBy">
										<MkA :to="`/admin/user/${row.redeemedBy.id}`" class="_link"><MkUserName :user="row.redeemedBy"/></MkA>
									</template>
									<template v-else>—</template>
								</span>
								<span :class="$style.colActions">
									<button v-if="row.status === 'available'" type="button" class="_button" :class="$style.revokeBtn" :disabled="revoking" @click="revoke(row)">
										<i class="ti ti-ban"></i>
										<span>{{ i18n.ts._agents.redeemCodesRevoke }}</span>
									</button>
								</span>
							</div>
						</div>
						<div v-if="listItems.length > 0" :class="$style.pagerBar" role="navigation" :aria-label="i18n.ts._agents.redeemCodesList">
							<div :class="$style.pagerSegGroup" :aria-label="i18n.ts._agents.pageSize" role="group">
								<button
									v-for="size in pageSizeOptions"
									:key="`list-${size}`"
									type="button"
									class="_button"
									:class="[$style.pagerSegBtn, listPageSize === size ? $style.pagerSegBtnActive : null]"
									@click="listPageSize = size"
								>{{ size }}</button>
							</div>
							<div :class="$style.pagerNavGroup" role="group">
								<button
									type="button"
									class="_button"
									:class="$style.pagerNavIconBtn"
									:disabled="listPage <= 1 || listLoading"
									:aria-label="i18n.ts._agents.sessionMemoryPrevPage"
									@click="goListPage(listPage - 1)"
								>
									<i class="ti ti-chevron-left" aria-hidden="true"/>
								</button>
								<span :class="$style.pagerNavText">{{ listPage }}</span>
								<button
									type="button"
									class="_button"
									:class="$style.pagerNavIconBtn"
									:disabled="!listHasNext || listLoading"
									:aria-label="i18n.ts._agents.sessionMemoryNextPage"
									@click="goListPage(listPage + 1)"
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
										:value="listPageInput"
										:disabled="listLoading"
										:class="$style.pagerGoNativeInput"
										:aria-label="i18n.ts._agents.pageJump"
										@input="syncListPagerInput"
										@keydown.enter.prevent="goListInputPage"
									/>
								</div>
								<button
									type="button"
									class="_button"
									:class="$style.pagerGoJumpBtn"
									:disabled="listLoading"
									@click="goListInputPage"
								>{{ i18n.ts._agents.pageJump }}</button>
							</div>
						</div>
					</div>
				</MkFolder>
			</div>
		</SearchMarker>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import type { MkSelectItem } from '@/components/MkSelect.vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkA from '@/components/global/MkA.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import FormSplit from '@/components/form/split.vue';
import SearchMarker from '@/components/global/SearchMarker.vue';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';

definePage({
	title: i18n.ts._agents.redeemCodesManage,
	icon: 'ti ti-ticket',
});

// ──── 生成 ────
const genAmount = ref<number>(10);
const genCount = ref<number>(1);
const genNote = ref('');
const genExpiresAt = ref('');
const generating = ref(false);
const generated = ref<{ id: string; code: string; creditAmount: number }[]>([]);
const genAmountValid = computed(() => typeof genAmount.value === 'number' && genAmount.value > 0);

async function generate() {
	generating.value = true;
	try {
		const params: Record<string, unknown> = {
			creditAmount: genAmount.value,
			count: genCount.value,
			note: genNote.value,
		};
		if (genExpiresAt.value) {
			params['expiresAt'] = new Date(genExpiresAt.value).toISOString();
		}
		const result = await misskeyApi('admin/agents/redeem-codes/generate' as any, params);
		generated.value = result as any;
		os.toast(i18n.ts._agents.redeemCodesGenerateSuccess);
		loadList(true);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		generating.value = false;
	}
}

function copyOne(code: string) {
	copyToClipboard(code);
	os.toast(i18n.ts.copiedToClipboard);
}

function copyAllCodes() {
	const text = generated.value.map(c => c.code).join('\n');
	copyToClipboard(text);
	os.toast(i18n.ts.copiedToClipboard);
}

// ──── 列表 ────
type ListRow = {
	id: string;
	createdAt: string;
	code: string;
	creditAmount: number;
	note: string;
	status: 'available' | 'redeemed' | 'expired' | 'revoked';
	redeemedBy: any;
};

const PAGE_SIZE = 20;
const pageSizeOptions = [10, 20, 50] as const;
const listLoading = ref(false);
const listItems = ref<ListRow[]>([]);
const listPage = ref(1);
const listPageInput = ref('1');
const listPageSize = ref<number>(PAGE_SIZE);
const listHasNext = ref(false);
const filterStatus = ref<string | null>(null);
const revoking = ref(false);
const listPageCache = ref<Record<number, ListRow[]>>({});
const listPageCursorMap = ref<Record<number, string | null>>({ 1: null });

const statusItems = computed((): MkSelectItem[] => [
	{ value: null, label: i18n.ts._agents.redeemCodesStatusAll },
	{ value: 'available', label: i18n.ts._agents.redeemCodesStatusAvailable },
	{ value: 'redeemed', label: i18n.ts._agents.redeemCodesStatusRedeemed },
	{ value: 'expired', label: i18n.ts._agents.redeemCodesStatusExpired },
	{ value: 'revoked', label: i18n.ts._agents.redeemCodesStatusRevoked },
]);

function statusLabel(s: string): string {
	if (s === 'available') return i18n.ts._agents.redeemCodesStatusAvailable;
	if (s === 'redeemed') return i18n.ts._agents.redeemCodesStatusRedeemed;
	if (s === 'expired') return i18n.ts._agents.redeemCodesStatusExpired;
	return i18n.ts._agents.redeemCodesStatusRevoked;
}

function statusColor(s: string): string {
	if (s === 'available') return 'var(--MI_THEME-accent)';
	if (s === 'expired') return 'var(--MI_THEME-warn)';
	if (s === 'revoked') return 'var(--MI_THEME-error)';
	return 'var(--MI_THEME-fgTransparentWeak)';
}

function formatBjt(iso: string): string {
	return new Date(iso).toLocaleString('zh-CN', {
		timeZone: 'Asia/Shanghai',
		hour12: false,
	});
}

async function loadListPage(page: number, force = false) {
	if (page < 1) return;
	listLoading.value = true;
	try {
		if (!force && listPageCache.value[page]) {
			listItems.value = listPageCache.value[page];
			listPage.value = page;
			listPageInput.value = String(page);
			listHasNext.value = listItems.value.length === listPageSize.value;
			return;
		}
		if (listPageCursorMap.value[page] === undefined) {
			for (let p = 1; p < page; p++) {
				if (listPageCursorMap.value[p + 1] !== undefined) continue;
				if (!listPageCache.value[p]) {
					await loadListPage(p, true);
				}
				const prevRows = listPageCache.value[p] ?? [];
				const prevLast = prevRows.at(-1);
				listPageCursorMap.value[p + 1] = prevLast ? prevLast.id : null;
			}
		}
		const params: Record<string, unknown> = { limit: listPageSize.value };
		if (filterStatus.value) params['status'] = filterStatus.value;
		const untilId = listPageCursorMap.value[page] ?? null;
		if (untilId) params['untilId'] = untilId;
		const list = await misskeyApi('admin/agents/redeem-codes/list' as any, params) as ListRow[];

		listPageCache.value[page] = list;
		listItems.value = list;
		listPage.value = page;
		listPageInput.value = String(page);
		listHasNext.value = list.length === listPageSize.value;

		const last = list.at(-1);
		listPageCursorMap.value[page + 1] = last ? last.id : null;
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		listLoading.value = false;
	}
}

function syncListPagerInput(ev: Event) {
	listPageInput.value = (ev.target as HTMLInputElement).value;
}

function resetListPager() {
	listPage.value = 1;
	listPageInput.value = '1';
	listHasNext.value = false;
	listPageCache.value = {};
	listPageCursorMap.value = { 1: null };
	listItems.value = [];
}

function goListPage(page: number) {
	const p = Math.max(1, Math.trunc(page));
	loadListPage(p);
}

function goListInputPage() {
	const p = Number(listPageInput.value);
	if (!Number.isFinite(p)) return;
	goListPage(p);
}

async function revoke(row: ListRow) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._agents.redeemCodesRevokeConfirm,
	});
	if (canceled) return;
	revoking.value = true;
	try {
		await misskeyApi('admin/agents/redeem-codes/revoke' as any, { codeId: row.id });
		const updated = listItems.value.map(r =>
			r.id === row.id ? { ...r, status: 'revoked' as const } : r,
		);
		listItems.value = updated;
		listPageCache.value[listPage.value] = updated;
		os.toast(i18n.ts._agents.redeemCodesRevoked);
	} catch (err) {
		os.alert({ type: 'error', text: formatApiError(err) });
	} finally {
		revoking.value = false;
	}
}

onMounted(() => {
	loadListPage(1, true);
});

watch(filterStatus, () => {
	resetListPager();
	loadListPage(1, true);
});

watch(listPageSize, () => {
	resetListPager();
	loadListPage(1, true);
});
</script>

<style lang="scss" module>
.generatedBox {
	padding: 14px;
	border-radius: var(--MI-radius);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 30%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-accent) 4%, transparent);
}
.generatedHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 10px;
}
.generatedTitle {
	font-weight: 700;
	font-size: 0.9em;
}
.codeList {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
.codeItem {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 10px;
	border-radius: 6px;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
}
.codeText {
	font-size: 0.95em;
	font-weight: 600;
	letter-spacing: 0.08em;
	flex: 1;
}
.codeAmount {
	font-size: 0.85em;
	color: var(--MI_THEME-accent);
	font-weight: 700;
}
.codeCopy {
	padding: 4px 8px;
	border-radius: 4px;
	color: var(--MI_THEME-fgTransparentWeak);
	&:hover {
		color: var(--MI_THEME-accent);
		background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	}
}

/* 列表 */
.filterRow {
	display: flex;
	align-items: flex-end;
	gap: 10px;
}
.emptyMsg {
	text-align: center;
	padding: 20px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}
.table {
	display: block;
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	overflow-x: auto;
	overflow-y: hidden;
}
.tableHead {
	display: grid;
	grid-template-columns: 132px minmax(132px, 1fr) 54px 54px minmax(70px, 0.7fr) minmax(70px, 0.7fr) 62px;
	gap: 6px;
	min-width: 580px;
	padding: 8px 12px;
	background: var(--MI_THEME-bg);
	font-size: 0.78em;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
}
.tableRow {
	display: grid;
	grid-template-columns: 132px minmax(132px, 1fr) 54px 54px minmax(70px, 0.7fr) minmax(70px, 0.7fr) 62px;
	gap: 6px;
	min-width: 580px;
	padding: 8px 12px;
	border-top: solid 1px var(--MI_THEME-divider);
	font-size: 0.83em;
	align-items: center;
	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-accent) 3%, transparent);
	}
}
.colCreatedAt {
	min-width: 140px;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.86em;
}

.colCode {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 0.88em;
	letter-spacing: 0.02em;
}
.colAmount {
	min-width: 54px;
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	text-align: right;
}
.colStatus {
	min-width: 54px;
	font-weight: 600;
	font-size: 0.85em;
	text-align: center;
}
.colNote {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.88em;
	text-align: center;
}
.colUser {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	text-align: center;
}
.colActions {
	min-width: 52px;
	display: flex;
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
@media (max-width: 1100px) {
	.tableHead {
		grid-template-columns: 126px minmax(120px, 1fr) 52px 52px 62px 62px 58px;
		min-width: 540px;
		font-size: 0.74em;
	}
	.tableRow {
		grid-template-columns: 126px minmax(120px, 1fr) 52px 52px 62px 62px 58px;
		min-width: 540px;
		padding: 7px 10px;
		font-size: 0.82em;
	}
}

@media (max-width: 860px) {
	.tableHead {
		grid-template-columns: 120px minmax(112px, 1fr) 50px 50px 58px 56px;
		min-width: 500px;
	}
	.tableRow {
		grid-template-columns: 120px minmax(112px, 1fr) 50px 50px 58px 56px;
		min-width: 500px;
	}
	.colUser {
		display: none;
	}
}

@media (max-width: 760px) {
	.tableHead {
		grid-template-columns: 112px minmax(104px, 1fr) 48px 48px 54px;
		min-width: 430px;
	}
	.tableRow {
		grid-template-columns: 112px minmax(104px, 1fr) 48px 48px 54px;
		min-width: 430px;
	}
	.colNote {
		display: none;
	}
	.colActions {
		min-width: 48px;
	}
	.revokeBtn {
		padding: 4px 6px;
		gap: 0;
		> span {
			display: none;
		}
	}
}

/* 与 frontend/src/pages/agents/my-stats.vue 分页条完全一致（native input，三无盒与左中栏对齐） */
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
</style>
