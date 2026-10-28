/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { dirtyLeaves, dirtySections, groupOfLeaf, leafKeys, resolveLeaf, saveSectionHomeLeaf, sectionOfField, settingsGroups } from '@/pages/admin/agents-settings-sections.js';

describe('agents-settings sections', () => {
	test('old ?view links still resolve to a sub page', () => {
		for (const view of ['overview', 'basic', 'models', 'memory', 'compression', 'externalAudit', 'images', 'sticker', 'pet', 'vision', 'credits', 'migration', 'checkin', 'proactive', 'reports']) {
			expect(resolveLeaf(view)).toBe(view);
		}
		expect(resolveLeaf('unknown')).toBe('overview');
		expect(resolveLeaf(undefined)).toBe('overview');
	});

	test('leaf keys are unique and every leaf belongs to one group', () => {
		expect(new Set(leafKeys).size).toBe(leafKeys.length);
		for (const leaf of leafKeys) expect(groupOfLeaf(leaf).leaves.some(l => l.key === leaf)).toBe(true);
	});

	test('fields map to sections; unknown fields throw instead of being silently skipped', () => {
		expect(sectionOfField('agentLlmModelRows')).toBe('models');
		expect(sectionOfField('agentByokProviderRows')).toBe('models');
		expect(sectionOfField('agentReviewTriggerRules')).toBe('externalAudit');
		expect(sectionOfField('agentImageTokenRows')).toBe('images');
		expect(sectionOfField('agentEmojiPromptMaxCount')).toBe('sticker');
		expect(sectionOfField('checkinMakeupBaseCost')).toBe('checkin');
		expect(sectionOfField('agentAliyaWebUrl')).toBe('basic');
		expect(() => sectionOfField('somethingNew')).toThrow();
	});

	test('dirty state only includes modified sections and their exact sub pages', () => {
		const modified = { agentByokEnabled: true, agentMem0TopK: false, agentExternalAuditRuleRows: true };
		expect(dirtySections(modified).sort()).toEqual(['externalAudit', 'models']);
		expect([...dirtyLeaves(modified)].sort()).toEqual(['byok', 'externalAuditRules']);
	});

	test('every save section has a home leaf that lists it', () => {
		const allLeaves = settingsGroups.flatMap(g => g.leaves);
		for (const [section, leaf] of Object.entries(saveSectionHomeLeaf)) {
			expect(allLeaves.find(l => l.key === leaf)?.sections).toContain(section);
		}
	});
});
