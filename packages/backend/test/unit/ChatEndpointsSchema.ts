/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import * as endpointsObject from '@/server/api/endpoint-list.js';
import AdminAgentMessagesList from '@/server/api/endpoints/admin/agents/messages/list.js';
import AdminAgentRedeemCodesList from '@/server/api/endpoints/admin/agents/redeem-codes/list.js';

function createEmptyQueryBuilder() {
	const qb: any = {
		innerJoinAndSelect: () => qb,
		leftJoinAndSelect: () => qb,
		leftJoin: () => qb,
		andWhere: () => qb,
		take: () => qb,
		getMany: async () => [],
	};
	return qb;
}

describe('Chat & modified endpoint AJV schemas', () => {
	test('every endpoint in endpoint-list compiles its paramDef via Endpoint constructor without AJV error', () => {
		const entries = Object.entries(endpointsObject);
		expect(entries.length).toBeGreaterThan(0);

		for (const [name, mod] of entries) {
			const EndpointClass = (mod as { default: new (...args: any[]) => unknown }).default;
			expect(typeof EndpointClass, `endpoint ${name} should export default class`).toBe('function');
			const stubArgs = Array.from({ length: Math.max(EndpointClass.length, 20) }, () => ({}));
			expect(() => new EndpointClass(...stubArgs), `endpoint ${name} failed schema compilation`).not.toThrow();
		}
	});

	test('admin/agents/messages/list and redeem-codes/list accept explicit null for nullable enum filters', async () => {
		const messagesList = new AdminAgentMessagesList(
			{ createQueryBuilder: createEmptyQueryBuilder } as never,
			{ findBy: async () => [] } as never,
			{ assertAgentsEnabled: () => {} } as never,
			{ makePaginationQuery: (q: unknown) => q } as never,
			{ packMany: async () => [] } as never,
		);
		await expect(messagesList.exec({ role: null }, { id: 'mod1' } as never, null)).resolves.toEqual([]);
		await expect(messagesList.exec({ role: 'invalid_role' }, { id: 'mod1' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });

		const redeemCodesList = new AdminAgentRedeemCodesList(
			{ createQueryBuilder: createEmptyQueryBuilder } as never,
			{ findBy: async () => [] } as never,
			{ makePaginationQuery: (q: unknown) => q } as never,
			{ packMany: async () => [] } as never,
		);
		await expect(redeemCodesList.exec({ status: null }, { id: 'admin1' } as never, null)).resolves.toEqual([]);
		await expect(redeemCodesList.exec({ status: 'bogus' }, { id: 'admin1' } as never, null)).rejects.toMatchObject({ code: 'INVALID_PARAM' });
	});
});
