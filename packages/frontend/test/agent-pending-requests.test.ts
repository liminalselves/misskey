/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import { getStoredPendingRequestId, setStoredPendingRequestId } from '@/utility/agent-pending-requests.js';

describe('agent 在途请求 ID 持久化', () => {
	test('写入后可读取，清除后返回 null', () => {
		window.localStorage.clear();
		setStoredPendingRequestId('sess1', 'req-abc');
		assert.equal(getStoredPendingRequestId('sess1'), 'req-abc');
		assert.equal(getStoredPendingRequestId('sess2'), null);

		setStoredPendingRequestId('sess1', null);
		assert.equal(getStoredPendingRequestId('sess1'), null);
	});

	test('多会话互不干扰，清除不会波及其它会话', () => {
		window.localStorage.clear();
		setStoredPendingRequestId('sess1', 'req-1');
		setStoredPendingRequestId('sess2', 'req-2');
		assert.equal(getStoredPendingRequestId('sess1'), 'req-1');
		assert.equal(getStoredPendingRequestId('sess2'), 'req-2');

		setStoredPendingRequestId('sess1', null);
		assert.equal(getStoredPendingRequestId('sess1'), null);
		assert.equal(getStoredPendingRequestId('sess2'), 'req-2');
	});

	test('同一会话再次发送会覆盖旧 ID（模拟新请求占位）', () => {
		window.localStorage.clear();
		setStoredPendingRequestId('sess1', 'req-old');
		setStoredPendingRequestId('sess1', 'req-new');
		assert.equal(getStoredPendingRequestId('sess1'), 'req-new');
	});

	test('存储损坏时安全降级为 null，不抛异常', () => {
		window.localStorage.clear();
		window.localStorage.setItem('agentPendingRequests', '{broken json');
		assert.equal(getStoredPendingRequestId('sess1'), null);
		// 写入也不应抛异常
		setStoredPendingRequestId('sess1', 'req-x');
		assert.equal(getStoredPendingRequestId('sess1'), 'req-x');
	});

	test('空字符串视为无效 ID', () => {
		window.localStorage.clear();
		window.localStorage.setItem('agentPendingRequests', JSON.stringify({ sess1: '' }));
		assert.equal(getStoredPendingRequestId('sess1'), null);
	});
});
