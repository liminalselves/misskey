/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 额度批量签发 CSV 解析（纯函数，供管理端「智能体管理 → 额度」导入使用）。
 * 契约见 docs/agent-credit-grants.md：UTF-8（可带 BOM），固定 4 列「类型,用户,数量,原因」，
 * 支持中文表头或无表头，标准 CSV 双引号转义。解析失败的行只进 errors，不阻断有效行。
 */

export type CreditGrantCsvRow = {
	kind: 'reward' | 'compensation';
	userRef: string;
	amount: number;
	reason: string | null;
};

export type CreditGrantCsvError = {
	/** 数据行号（从 1 开始，不含表头与空行；0 表示整文件级错误） */
	row: number;
	message: string;
};

export const CREDIT_GRANT_CSV_MAX_ROWS = 200;

/** 标准 CSV 切分：引号内可含逗号/换行，"" 为转义引号；兼容 CRLF/LF/CR */
function splitRecords(text: string): string[][] {
	const records: string[][] = [];
	let field = '';
	let record: string[] = [];
	let inQuotes = false;
	let fieldStarted = false;
	const pushField = () => {
		record.push(field);
		field = '';
		fieldStarted = false;
	};
	const pushRecord = () => {
		pushField();
		records.push(record);
		record = [];
	};
	let i = 0;
	while (i < text.length) {
		const ch = text.charAt(i);
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
				i++;
				continue;
			}
			field += ch;
			i++;
			continue;
		}
		if (ch === '"' && !fieldStarted) {
			inQuotes = true;
			fieldStarted = true;
			i++;
			continue;
		}
		if (ch === ',') {
			pushField();
			i++;
			continue;
		}
		if (ch === '\r') {
			if (text[i + 1] === '\n') i++;
			pushRecord();
			i++;
			continue;
		}
		if (ch === '\n') {
			pushRecord();
			i++;
			continue;
		}
		field += ch;
		fieldStarted = true;
		i++;
	}
	if (fieldStarted || record.length > 0) pushRecord();
	return records;
}

function parseKind(raw: string): 'reward' | 'compensation' | null {
	const v = raw.trim().toLowerCase();
	if (v === '奖励' || v === 'reward') return 'reward';
	if (v === '补偿' || v === 'compensation') return 'compensation';
	return null;
}

/** 只接受普通十进制写法（拒绝科学计数法/十六进制等 Number 的宽松解析） */
function parseAmount(raw: string): number | null {
	const trimmed = raw.trim();
	if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) return null;
	const value = Number(trimmed);
	return Number.isFinite(value) ? value : null;
}

export function parseAgentCreditGrantCsv(text: string): { rows: CreditGrantCsvRow[]; errors: CreditGrantCsvError[] } {
	const rows: CreditGrantCsvRow[] = [];
	const errors: CreditGrantCsvError[] = [];
	const records = splitRecords(text.replace(/^\uFEFF/, ''));

	let startIndex = 0;
	const head = (records[0]?.[0] ?? '').trim().toLowerCase();
	if (head === '类型' || head === 'kind' || head === 'type') startIndex = 1;

	let dataRow = 0;
	for (const record of records.slice(startIndex)) {
		if (record.every(f => f.trim() === '')) continue;
		dataRow++;

		if (record.length !== 4) {
			errors.push({ row: dataRow, message: `需要 4 列（类型,用户,数量,原因），实际 ${record.length} 列` });
			continue;
		}
		const [kindRaw, userRaw, amountRaw, reasonRaw] = record as [string, string, string, string];

		const kind = parseKind(kindRaw);
		if (kind == null) {
			errors.push({ row: dataRow, message: `类型无效「${kindRaw.trim()}」，支持 奖励/reward、补偿/compensation` });
			continue;
		}

		const userRef = userRaw.trim();
		if (userRef === '') {
			errors.push({ row: dataRow, message: '用户为空' });
			continue;
		}
		if (userRef.length > 128) {
			errors.push({ row: dataRow, message: '用户超过 128 字符' });
			continue;
		}

		const amount = parseAmount(amountRaw);
		if (amount == null) {
			errors.push({ row: dataRow, message: `数量无效「${amountRaw.trim()}」` });
			continue;
		}
		if (amount < 0.01 || amount > 100000) {
			errors.push({ row: dataRow, message: `数量 ${amount} 超出范围（0.01～100000）` });
			continue;
		}
		const rounded = Math.round(amount * 100) / 100;
		if (Math.abs(amount - rounded) > Number.EPSILON * Math.max(1, Math.abs(amount))) {
			errors.push({ row: dataRow, message: `数量 ${amountRaw.trim()} 最多两位小数` });
			continue;
		}

		const reason = reasonRaw.trim();
		if (reason.length > 200) {
			errors.push({ row: dataRow, message: `原因超过 200 字（${reason.length} 字）` });
			continue;
		}

		rows.push({ kind, userRef, amount: rounded, reason: reason === '' ? null : reason });
	}

	if (dataRow > CREDIT_GRANT_CSV_MAX_ROWS) {
		errors.push({ row: 0, message: `共 ${dataRow} 条记录，超过单批上限 ${CREDIT_GRANT_CSV_MAX_ROWS} 条，仅导入前 ${CREDIT_GRANT_CSV_MAX_ROWS} 条有效记录` });
		if (rows.length > CREDIT_GRANT_CSV_MAX_ROWS) rows.length = CREDIT_GRANT_CSV_MAX_ROWS;
	}

	return { rows, errors };
}
