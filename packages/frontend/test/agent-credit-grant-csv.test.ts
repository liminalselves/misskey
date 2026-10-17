/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { CREDIT_GRANT_CSV_MAX_ROWS, parseAgentCreditGrantCsv } from '@/utility/agent-credit-grant-csv.js';

describe('agent-credit-grant-csv', () => {
	test('parses headerless rows', () => {
		const { rows, errors } = parseAgentCreditGrantCsv('补偿,@alice,12.50,模型计费差额补偿\n奖励,@bob,5,活动奖励');
		expect(errors).toEqual([]);
		expect(rows).toEqual([
			{ kind: 'compensation', userRef: '@alice', amount: 12.5, reason: '模型计费差额补偿' },
			{ kind: 'reward', userRef: '@bob', amount: 5, reason: '活动奖励' },
		]);
	});

	test('skips Chinese header and BOM', () => {
		const { rows, errors } = parseAgentCreditGrantCsv('﻿类型,用户,数量,原因\n补偿,@alice,1.5,原因');
		expect(errors).toEqual([]);
		expect(rows).toEqual([{ kind: 'compensation', userRef: '@alice', amount: 1.5, reason: '原因' }]);
	});

	test('skips English kind header', () => {
		const { rows, errors } = parseAgentCreditGrantCsv('kind,user,amount,reason\nreward,abc123def,2,');
		expect(errors).toEqual([]);
		expect(rows).toEqual([{ kind: 'reward', userRef: 'abc123def', amount: 2, reason: null }]);
	});

	test('quoted fields with commas, quotes and newlines', () => {
		const { rows, errors } = parseAgentCreditGrantCsv('补偿,"@alice, 测试","10.25","包含,逗号""引号""\n和换行"');
		expect(errors).toEqual([]);
		expect(rows).toEqual([{
			kind: 'compensation',
			userRef: '@alice, 测试',
			amount: 10.25,
			reason: '包含,逗号"引号"\n和换行',
		}]);
	});

	test('accepts CRLF and skips blank lines', () => {
		const { rows, errors } = parseAgentCreditGrantCsv('奖励,@a,1,\r\n\r\n补偿,@b,2,x\r\n');
		expect(errors).toEqual([]);
		expect(rows.map(r => r.userRef)).toEqual(['@a', '@b']);
	});

	test('kind aliases are case-insensitive', () => {
		const { rows, errors } = parseAgentCreditGrantCsv('REWARD,@a,1,\nCompensation,@b,2,');
		expect(errors).toEqual([]);
		expect(rows.map(r => r.kind)).toEqual(['reward', 'compensation']);
	});

	test('invalid kind/user/amount/reason rows become errors and do not block valid rows', () => {
		const text = [
			'礼物,@a,1,x', // bad kind
			'奖励,,1,x', // empty user
			'奖励,@a,abc,x', // NaN
			'奖励,@a,0,x', // below min
			'奖励,@a,100000.01,x', // above max
			'奖励,@a,1.001,x', // >2 decimals
			'奖励,@a,1e2,x', // scientific notation rejected
			`奖励,@a,1,${'长'.repeat(201)}`, // reason too long
			'奖励,@a,1', // missing column
			'补偿,@ok,19.99,有效行',
		].join('\n');
		const { rows, errors } = parseAgentCreditGrantCsv(text);
		expect(rows).toEqual([{ kind: 'compensation', userRef: '@ok', amount: 19.99, reason: '有效行' }]);
		expect(errors.map(e => e.row)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
	});

	test('boundary amounts 0.01 and 100000 pass', () => {
		const { rows, errors } = parseAgentCreditGrantCsv('奖励,@a,0.01,\n补偿,@b,100000,');
		expect(errors).toEqual([]);
		expect(rows.map(r => r.amount)).toEqual([0.01, 100000]);
	});

	test('over-limit batch reports a whole-file error and truncates to the cap', () => {
		const lines = Array.from({ length: CREDIT_GRANT_CSV_MAX_ROWS + 5 }, (_, i) => `奖励,@u${i},1,`);
		const { rows, errors } = parseAgentCreditGrantCsv(lines.join('\n'));
		expect(rows).toHaveLength(CREDIT_GRANT_CSV_MAX_ROWS);
		expect(errors.some(e => e.row === 0)).toBe(true);
	});

	test('empty input yields no rows and no errors', () => {
		const { rows, errors } = parseAgentCreditGrantCsv('');
		expect(rows).toEqual([]);
		expect(errors).toEqual([]);
	});

	test('header-only input yields no rows', () => {
		const { rows, errors } = parseAgentCreditGrantCsv('类型,用户,数量,原因');
		expect(rows).toEqual([]);
		expect(errors).toEqual([]);
	});
});
