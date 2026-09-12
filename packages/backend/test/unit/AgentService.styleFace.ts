/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { styleUsesPublishedFaceForSession } from '@/core/AgentService.js';

describe('styleUsesPublishedFaceForSession', () => {
	const styleOwner = 'style-owner';
	const otherUser = 'other-user';

	test('draft_test 会话一律使用草稿（无论文风发布状态与归属）', () => {
		expect(styleUsesPublishedFaceForSession('draft_test', { userId: styleOwner, publishedVersion: 3 }, styleOwner)).toBe(false);
		expect(styleUsesPublishedFaceForSession('draft_test', { userId: styleOwner, publishedVersion: 3 }, otherUser)).toBe(false);
		expect(styleUsesPublishedFaceForSession('draft_test', { userId: styleOwner, publishedVersion: null }, styleOwner)).toBe(false);
	});

	test('community 会话的已发布文风一律取已发布快照（含作者本人）', () => {
		expect(styleUsesPublishedFaceForSession('community', { userId: styleOwner, publishedVersion: 3 }, styleOwner)).toBe(true);
		expect(styleUsesPublishedFaceForSession('community', { userId: styleOwner, publishedVersion: 3 }, otherUser)).toBe(true);
	});

	test('community 会话中作者本人可自测自己未发布的文风（回退草稿）', () => {
		expect(styleUsesPublishedFaceForSession('community', { userId: styleOwner, publishedVersion: null }, styleOwner)).toBe(false);
	});

	test('community 会话中非作者遇到未发布文风保持取快照（必失败，不泄漏草稿）', () => {
		expect(styleUsesPublishedFaceForSession('community', { userId: styleOwner, publishedVersion: null }, otherUser)).toBe(true);
	});
});
