/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import {
	buildDeleteConfirmText,
	formatFileSize,
	isResolvedResult,
	pageAfterRemoval,
	resolvedIds,
	scopeLabel,
	summarizeBatch,
	type MissingBatchResponse,
} from '@/utility/drive-missing-reports.js';

const response = (items: MissingBatchResponse['items'], aborted = false): MissingBatchResponse => ({ aborted, items });

describe('isResolvedResult / resolvedIds', () => {
	test('only deleted, restored and vanished records leave the list', () => {
		expect(isResolvedResult('deleted')).toBe(true);
		expect(isResolvedResult('present')).toBe(true);
		expect(isResolvedResult('gone')).toBe(true);
		// 仍缺失或无法确认的必须留在列表里，管理员才能再次处理
		expect(isResolvedResult('missing')).toBe(false);
		expect(isResolvedResult('unknown')).toBe(false);
	});

	test('collects the ids that should be removed in place', () => {
		const res = response([
			{ id: 'a', result: 'deleted' },
			{ id: 'b', result: 'unknown' },
			{ id: 'c', result: 'present' },
			{ id: 'd', result: 'missing' },
			{ id: 'e', result: 'gone' },
		]);
		expect(resolvedIds(res)).toEqual(['a', 'c', 'e']);
	});

	test('an aborted batch removes nothing', () => {
		expect(resolvedIds(response([{ id: 'a', result: 'unknown' }, { id: 'b', result: 'gone' }], true))).toEqual(['b']);
	});
});

describe('summarizeBatch', () => {
	test('an aborted batch says nothing was changed instead of reporting counts', () => {
		const text = summarizeBatch(response([{ id: 'a', result: 'unknown' }], true), 'delete');
		expect(text).toContain('未做任何改动');
		expect(text).not.toMatch(/已删除/);
	});

	test('reports every outcome of a delete batch', () => {
		const text = summarizeBatch(response([
			{ id: 'a', result: 'deleted' },
			{ id: 'b', result: 'deleted' },
			{ id: 'c', result: 'present' },
			{ id: 'd', result: 'unknown' },
			{ id: 'e', result: 'gone' },
		]), 'delete');
		expect(text).toContain('已删除 2 个');
		expect(text).toContain('1 个对象已恢复');
		expect(text).toContain('1 个无法确认，未做改动');
		expect(text).toContain('1 个记录已不存在');
	});

	test('a recheck batch reports still-missing files and never claims deletion', () => {
		const text = summarizeBatch(response([{ id: 'a', result: 'missing' }, { id: 'b', result: 'present' }]), 'recheck');
		expect(text).toContain('1 个仍然缺失');
		expect(text).not.toContain('已删除');
	});

	test('an empty result has a neutral message', () => {
		expect(summarizeBatch(response([]), 'delete')).toBe('没有需要处理的记录');
	});
});

describe('helpers', () => {
	test('scope labels', () => {
		expect(scopeLabel('legacy')).toBe('旧桶');
		expect(scopeLabel('current')).toBe('当前桶');
	});

	test('file size formatting', () => {
		expect(formatFileSize(0)).toBe('0 B');
		expect(formatFileSize(1536)).toBe('1.5 KB');
		expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
		expect(formatFileSize(3 * 1024 * 1024 * 1024)).toBe('3.00 GB');
		expect(formatFileSize(-1)).toBe('-');
		expect(formatFileSize(Number.NaN)).toBe('-');
	});

	test('the delete confirmation states the count and the consequences', () => {
		const text = buildDeleteConfirmText(7);
		expect(text).toContain('7 个');
		expect(text).toContain('再次向对象存储核实');
		expect(text).toContain('通知');
		expect(text).toContain('不可撤销');
	});

	test('steps back a page when the last row of a page is removed', () => {
		expect(pageAfterRemoval(3, 0)).toBe(2);
		expect(pageAfterRemoval(1, 0)).toBe(1);
		expect(pageAfterRemoval(3, 4)).toBe(3);
	});
});
