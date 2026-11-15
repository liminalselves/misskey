/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { ref } from 'vue';
import { useReportFilters } from '@/components/agent-report/use-report-filters.js';
import { useReportMode } from '@/components/agent-report/use-report-mode.js';

function make(simple: boolean) {
	const simpleRef = ref(simple);
	const state = useReportFilters({
		storageKey: 'test:filters',
		collapseKey: 'test:collapsed',
		defaultRange: '7d',
		modelName: id => id,
		simple: simpleRef,
	});
	return { state, simpleRef };
}

describe('agent-report simple mode', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	test('mode defaults to simple and is remembered per key', () => {
		const a = useReportMode('test:mode-a');
		expect(a.mode.value).toBe('simple');
		window.localStorage.setItem('test:mode-b', 'detailed');
		expect(useReportMode('test:mode-b').mode.value).toBe('detailed');
		window.localStorage.setItem('test:mode-c', 'garbage');
		expect(useReportMode('test:mode-c').mode.value).toBe('simple');
	});

	test('hidden filters do not reach requests or the active count in simple mode', () => {
		const { state, simpleRef } = make(false);
		state.filters.usageKinds = ['chat'];
		state.filters.compare = true;
		state.filters.bucket = 'hour';
		expect(state.params().usageKinds).toEqual(['chat']);
		expect(state.activeCount.value).toBe(3);

		simpleRef.value = true;
		expect(state.params().usageKinds).toEqual([]);
		expect(state.activeCount.value).toBe(0);
		expect(state.summary.value).not.toContain('对比');
		// The stored values survive for the way back to detailed mode.
		expect(state.filters.usageKinds).toEqual(['chat']);
		expect(state.filters.compare).toBe(true);
	});

	test('reset in simple mode keeps the hidden detailed filters', () => {
		const { state, simpleRef } = make(true);
		state.filters.range = '30d';
		state.filters.modelIds = ['m1'];
		state.filters.usageKinds = ['chat'];
		state.filters.compare = true;
		state.reset();
		expect(state.filters.range).toBe('7d');
		expect(state.filters.modelIds).toEqual([]);
		expect(state.filters.usageKinds).toEqual(['chat']);
		expect(state.filters.compare).toBe(true);

		simpleRef.value = false;
		state.reset();
		expect(state.filters.usageKinds).toEqual([]);
		expect(state.filters.compare).toBe(false);
	});

	test('simple mode always buckets automatically', () => {
		const { state, simpleRef } = make(false);
		state.filters.range = '7d';
		state.refreshWindow();
		state.filters.bucket = 'hour';
		expect(state.bucketUnit.value).toBe('hour');
		simpleRef.value = true;
		expect(state.bucketUnit.value).toBe('day');
	});
});
