<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- 批量签发奖励/补偿（自包含组件：状态、CSV 导入与 API 调用均在组件内） -->
<template>
<div class="_gaps">
	<MkFolder :defaultOpen="true">
		<template #icon><i class="ti ti-gift"></i></template>
		<template #label>签发奖励 / 补偿</template>
		<div class="_gaps">
			<MkInfo>逐行填写或导入 CSV（UTF-8，固定 4 列：类型,用户,数量,原因，可含中文表头）。每条独立入账并通知对应用户，单批最多 {{ maxRows }} 条；失败条目保留在列表中，可修改后再次发放。</MkInfo>

			<div :class="$style.toolbar">
				<MkButton small rounded @click="downloadTemplate"><i class="ti ti-download"></i> CSV 模板</MkButton>
				<MkButton small rounded :disabled="issuing" @click="openImportDialog"><i class="ti ti-file-upload"></i> 导入 CSV</MkButton>
				<MkButton small rounded :disabled="issuing || rows.length >= maxRows" @click="addRow"><i class="ti ti-plus"></i> 添加一行</MkButton>
				<input ref="importInputEl" type="file" accept=".csv,text/csv" style="display: none;" @change="onImportFileChange">
			</div>

			<MkInfo v-if="importErrors.length > 0" warn>
				<div>CSV 中以下行未导入：</div>
				<div v-for="(e, i) in importErrors.slice(0, 5)" :key="i">{{ e.row > 0 ? `第 ${e.row} 行：` : '' }}{{ e.message }}</div>
				<div v-if="importErrors.length > 5">…等 {{ importErrors.length }} 条</div>
			</MkInfo>

			<div :class="$style.gridWrap">
				<div :class="$style.gridHead">
					<span>类型</span>
					<span>用户</span>
					<span>数量</span>
					<span>原因（可选，将展示给用户）</span>
					<span></span>
				</div>
				<div v-for="(row, i) in rows" :key="row.key" :class="$style.rowWrap">
					<div :class="$style.gridRow">
						<div :class="$style.kindSeg" role="group" aria-label="类型">
							<button
								type="button"
								class="_button"
								:class="[$style.kindBtn, row.kind === 'reward' ? $style.kindRewardActive : null]"
								:disabled="issuing"
								@click="row.kind = 'reward'"
							>
								<i class="ti ti-gift" aria-hidden="true"></i> 奖励
							</button>
							<button
								type="button"
								class="_button"
								:class="[$style.kindBtn, row.kind === 'compensation' ? $style.kindCompActive : null]"
								:disabled="issuing"
								@click="row.kind = 'compensation'"
							>
								<i class="ti ti-receipt-refund" aria-hidden="true"></i> 补偿
							</button>
						</div>
						<MkInput v-model="row.userRef" type="text" small :disabled="issuing" placeholder="@username 或用户 ID"/>
						<MkInput v-model="row.amount" type="number" small :min="0.01" :max="100000" :step="0.01" :disabled="issuing" placeholder="0.00"/>
						<MkInput v-model="row.reason" type="text" small :disabled="issuing" placeholder="200 字以内"/>
						<button type="button" class="_button" :class="$style.removeBtn" :disabled="issuing" title="删除此行" @click="removeRow(row.key)">
							<i class="ti ti-trash"></i>
						</button>
					</div>
					<div v-if="row.error" :class="$style.rowError">第 {{ i + 1 }} 行发放失败：{{ row.error }}</div>
				</div>
			</div>

			<div :class="$style.summary">
				共 {{ rows.length }} 条
				<template v-if="rewardCount > 0">，<i class="ti ti-gift" aria-hidden="true"></i> 奖励 {{ rewardCount }} 条合计 {{ rewardTotal.toFixed(2) }}</template>
				<template v-if="compensationCount > 0">，<i class="ti ti-receipt-refund" aria-hidden="true"></i> 补偿 {{ compensationCount }} 条合计 {{ compensationTotal.toFixed(2) }}</template>
			</div>

			<div v-if="firstIssue != null" :class="$style.issueHint">{{ firstIssue }}</div>

			<MkButton primary rounded :disabled="!canSubmit" :wait="issuing" @click="submit">
				<i class="ti ti-gift"></i> 发放 {{ rows.length }} 条
			</MkButton>
		</div>
	</MkFolder>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { CreditGrantCsvError } from '@/utility/agent-credit-grant-csv.js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import * as os from '@/os.js';
import { misskeyApi, formatApiError } from '@/utility/misskey-api.js';
import { CREDIT_GRANT_CSV_MAX_ROWS, parseAgentCreditGrantCsv } from '@/utility/agent-credit-grant-csv.js';

const maxRows = CREDIT_GRANT_CSV_MAX_ROWS;

type GrantRow = {
	key: number;
	kind: 'reward' | 'compensation';
	userRef: string;
	amount: number | null;
	reason: string;
	/** 上次发放失败的行级错误（成功或重新编辑后清空） */
	error: string | null;
};

type IssueBatchItem = {
	kind: 'reward' | 'compensation';
	userRef: string;
	amount: number;
	reason: string | null;
};

type IssueBatchResponse = {
	results: Array<{
		index: number;
		ok: boolean;
		newBalance?: number;
		error?: { code: string; message: string };
	}>;
	successCount: number;
	failCount: number;
};

let nextKey = 1;

function createRow(): GrantRow {
	return { key: nextKey++, kind: 'compensation', userRef: '', amount: null, reason: '', error: null };
}

const rows = ref<GrantRow[]>([createRow()]);
const issuing = ref(false);
const importErrors = ref<CreditGrantCsvError[]>([]);
const importInputEl = ref<HTMLInputElement | null>(null);

function addRow() {
	if (rows.value.length >= maxRows) return;
	rows.value.push(createRow());
}

function removeRow(key: number) {
	rows.value = rows.value.filter(r => r.key !== key);
	if (rows.value.length === 0) rows.value.push(createRow());
}

/** 与 CSV 解析器及后端一致的数量校验：0.01～100000 且最多两位小数 */
function validateRow(row: GrantRow): string | null {
	if (row.userRef.trim() === '') return '用户为空';
	if (row.userRef.trim().length > 128) return '用户超过 128 字符';
	const amount = row.amount;
	if (amount == null || !Number.isFinite(amount)) return '数量无效';
	if (amount < 0.01 || amount > 100000) return '数量超出范围（0.01～100000）';
	const rounded = Math.round(amount * 100) / 100;
	if (Math.abs(amount - rounded) > Number.EPSILON * Math.max(1, Math.abs(amount))) return '数量最多两位小数';
	if (row.reason.trim().length > 200) return '原因超过 200 字';
	return null;
}

const firstIssue = computed(() => {
	if (rows.value.length === 0) return '请至少填写一行';
	if (rows.value.length > maxRows) return `超过单批上限 ${maxRows} 条`;
	for (const [i, row] of rows.value.entries()) {
		const issue = validateRow(row);
		if (issue != null) return `第 ${i + 1} 行：${issue}`;
	}
	return null;
});

const canSubmit = computed(() => !issuing.value && firstIssue.value == null);

const rewardCount = computed(() => rows.value.filter(r => r.kind === 'reward').length);
const compensationCount = computed(() => rows.value.length - rewardCount.value);

function totalOf(kind: GrantRow['kind']): number {
	return rows.value
		.filter(r => r.kind === kind)
		.reduce((s, r) => s + (r.amount != null && Number.isFinite(r.amount) ? r.amount : 0), 0);
}

const rewardTotal = computed(() => totalOf('reward'));
const compensationTotal = computed(() => totalOf('compensation'));

function downloadTemplate() {
	// BOM 保证 Excel 以 UTF-8 打开
	const content = '\uFEFF类型,用户,数量,原因\n补偿,@alice,12.50,模型计费差额补偿\n奖励,@bob,5.00,活动奖励\n';
	const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = window.document.createElement('a');
	a.href = url;
	a.download = 'credit-grants-template.csv';
	a.click();
	URL.revokeObjectURL(url);
}

function openImportDialog() {
	importInputEl.value?.click();
}

function hasEditableContent(): boolean {
	return rows.value.some(r => r.userRef.trim() !== '' || r.amount != null || r.reason.trim() !== '');
}

async function onImportFileChange(ev: Event) {
	const input = ev.target as HTMLInputElement | null;
	if (input == null || input.files == null) return;
	const file = input.files.item(0);
	if (file == null) return;
	input.value = '';
	const text = await file.text();
	const parsed = parseAgentCreditGrantCsv(text);
	importErrors.value = parsed.errors;
	if (parsed.rows.length === 0) {
		os.alert({
			type: 'error',
			text: parsed.errors.length > 0 ? '未导入任何有效记录，请按提示修正后重试。' : '文件为空或只有表头。',
		});
		return;
	}
	if (hasEditableContent()) {
		const { canceled } = await os.confirm({
			type: 'question',
			text: `导入将替换当前编辑的 ${rows.value.length} 行（解析出 ${parsed.rows.length} 条有效记录）。是否继续？`,
		});
		if (canceled) return;
	}
	rows.value = parsed.rows.map(r => ({
		key: nextKey++,
		kind: r.kind,
		userRef: r.userRef,
		amount: r.amount,
		reason: r.reason ?? '',
		error: null,
	}));
}

async function submit() {
	if (!canSubmit.value) return;
	const parts: string[] = [];
	if (rewardCount.value > 0) parts.push(`奖励 ${rewardCount.value} 条合计 ${rewardTotal.value.toFixed(2)}`);
	if (compensationCount.value > 0) parts.push(`补偿 ${compensationCount.value} 条合计 ${compensationTotal.value.toFixed(2)}`);
	const { canceled } = await os.confirm({
		type: 'question',
		title: '确认发放额度',
		text: `共 ${rows.value.length} 条（${parts.join('，')}）。每条独立入账并通知对应用户。是否继续？`,
	});
	if (canceled) return;

	const items: IssueBatchItem[] = rows.value.map(r => ({
		kind: r.kind,
		userRef: r.userRef.trim(),
		amount: Math.round(Number(r.amount) * 100) / 100,
		reason: r.reason.trim() === '' ? null : r.reason.trim(),
	}));

	issuing.value = true;
	try {
		const res = await (misskeyApi as unknown as (
			ep: 'admin/agents/credits/issue-batch',
			data: { items: IssueBatchItem[] },
		) => Promise<IssueBatchResponse>)('admin/agents/credits/issue-batch', { items });

		const failedKeys = new Set<number>();
		for (const result of res.results) {
			const row = rows.value.at(result.index);
			if (row == null) continue;
			if (result.ok) {
				row.error = null;
			} else {
				row.error = result.error?.message ?? '发放失败';
				failedKeys.add(row.key);
			}
		}
		// 成功行移除，失败行保留供修改后重发
		rows.value = rows.value.filter(r => failedKeys.has(r.key));
		if (rows.value.length === 0) rows.value.push(createRow());

		if (res.failCount === 0) {
			os.alert({ type: 'success', text: `已全部发放成功（${res.successCount} 条）。` });
		} else {
			os.alert({ type: 'warning', text: `成功 ${res.successCount} 条，失败 ${res.failCount} 条。失败条目已保留在列表中，可修改后重新发放。` });
		}
	} catch (err) {
		os.alert({
			type: 'error',
			text: `${formatApiError(err)}\n请求异常时可能已有部分条目入账，重新发放前请先在用户账单中核对，避免重复入账。`,
		});
	} finally {
		issuing.value = false;
	}
}
</script>

<style lang="scss" module>
.toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

/* 行式表格：窄屏横向滚动（项目表格惯例）。头/行共享同一列模板，单元格一律
   min-width:0，否则 MkInput 内 input 的固有最小宽度会撑宽行网格而与表头错位 */
.gridWrap {
	border-radius: var(--MI-radius);
	border: solid 1px var(--MI_THEME-divider);
	overflow-x: auto;
	box-sizing: border-box;
}

.gridHead,
.gridRow {
	display: grid;
	grid-template-columns: 172px minmax(150px, 1.1fr) minmax(96px, 0.6fr) minmax(170px, 1.3fr) 40px;
	gap: 8px;
	align-items: center;
	min-width: 680px;
	padding: 8px 10px;
	box-sizing: border-box;

	> * {
		min-width: 0;
	}
}

.gridRow :deep(input) {
	min-width: 0;
}

.gridHead {
	background: var(--MI_THEME-bg);
	font-size: 0.78em;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
}

.rowWrap {
	border-top: solid 1px var(--MI_THEME-divider);
	min-width: 680px;
	box-sizing: border-box;
}

.kindSeg {
	display: flex;
	width: 100%;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 6px;
	overflow: hidden;
	box-sizing: border-box;
}

.kindBtn {
	flex: 1;
	min-width: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 4px;
	height: 30px;
	padding: 0 6px;
	font-size: 0.82em;
	font-weight: 600;
	white-space: nowrap;
	color: var(--MI_THEME-fgTransparentWeak);
	background: transparent;
	box-sizing: border-box;

	&:first-child {
		border-right: solid 1px var(--MI_THEME-divider);
	}

	&:hover:not(:disabled) {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.kindRewardActive {
	color: #a855f7;
	background: color-mix(in srgb, #a855f7 14%, transparent);
}

.kindCompActive {
	color: #14b8a6;
	background: color-mix(in srgb, #14b8a6 14%, transparent);
}

.removeBtn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border-radius: 6px;
	color: var(--MI_THEME-fgTransparentWeak);

	&:hover:not(:disabled) {
		color: var(--MI_THEME-error);
		background: color-mix(in srgb, var(--MI_THEME-error) 10%, transparent);
	}
}

.rowError {
	padding: 4px 10px 8px;
	font-size: 0.8em;
	color: var(--MI_THEME-error);
}

.summary {
	font-size: 0.88em;
	color: var(--MI_THEME-fgTransparentWeak);
	font-variant-numeric: tabular-nums;
}

.issueHint {
	font-size: 0.82em;
	color: var(--MI_THEME-warn);
}
</style>
