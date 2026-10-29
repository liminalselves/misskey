/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { parseAst } from 'rolldown/parseAst';
import { collectModifications } from '../../frontend-builder/locale-inliner/collect-modifications.js';
import { blankLogger } from '../../frontend-builder/logger.js';
import type { LocaleInliner } from '../../frontend-builder/locale-inliner.js';

const inliner = {
	i18nFileName: 'locale.js',
	i18nSymbol: 'i',
	scriptsDir: 'scripts',
} as LocaleInliner;

function inline(source: string) {
	const logger = { ...blankLogger, error: vi.fn() };
	const modifications = collectModifications(source, 'fixture.js', logger, inliner);
	let result = source;
	for (const modification of [...modifications].sort((a, b) => b.begin - a.begin)) {
		if (modification.type !== 'delete' && modification.type !== 'localized') continue;
		const replacement = modification.type === 'delete' ? '' : JSON.stringify('Translated');
		result = result.slice(0, modification.begin) + replacement + result.slice(modification.end);
	}
	return { result, logger };
}

describe('locale imports in shared Rolldown chunks', () => {
	test.each([
		'i as locale, helper as h',
		'helper as h, i as locale',
		'helper as h, i as locale, other as o',
	])('preserves unrelated imports when inlining %s', specifiers => {
		const { result, logger } = inline(`import { ${specifiers} } from './locale.js'; console.log(locale.ts.title, h);`);
		expect(logger.error).not.toHaveBeenCalled();
		expect(result).toContain('helper as h');
		expect(result).not.toContain('i as locale');
		expect(result).toContain('"Translated"');
		expect(() => parseAst(result)).not.toThrow();
	});

	test('inlines direct locale dictionary access without retaining the runtime import', () => {
		const logger = { ...blankLogger, error: vi.fn() };
		const modifications = collectModifications("import { i as locale } from './locale.js'; consume(locale.locale._agents);", 'fixture.js', logger, inliner);
		expect(modifications).toContainEqual(expect.objectContaining({ type: 'localized', localizationKey: ['_agents'] }));
		expect(logger.error).not.toHaveBeenCalled();
	});

	test('leaves helper-only imports untouched', () => {
		const source = "import { helper as h } from './locale.js'; console.log(h);";
		const { result, logger } = inline(source);
		expect(result).toBe(source);
		expect(logger.error).not.toHaveBeenCalled();
	});

	test('removes the complete declaration when only the locale is imported', () => {
		const { result, logger } = inline("import { i as locale } from './locale.js'; console.log(locale.ts.title);");
		expect(result).not.toContain('import');
		expect(result).toContain('"Translated"');
		expect(logger.error).not.toHaveBeenCalled();
		expect(() => parseAst(result)).not.toThrow();
	});

	test('keeps a shared import when the locale object is used directly', () => {
		const { result, logger } = inline("import { i as locale, helper as h } from './locale.js'; consume(locale, h);");
		expect(result).toContain('i as locale');
		expect(result).toContain('helper as h');
		expect(logger.error).toHaveBeenCalledOnce();
		expect(() => parseAst(result)).not.toThrow();
	});
});
