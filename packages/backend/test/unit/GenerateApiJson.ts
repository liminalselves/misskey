/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const source = readFileSync(resolve('scripts/generate_api_json.js'), 'utf8');

function runGenerator(fail: boolean) {
	const directory = mkdtempSync(join(tmpdir(), 'misskey-api-cli-'));
	mkdirSync(join(directory, 'built'));
	const script = source
		.replace("import { execa } from 'execa';", 'const execa = async () => {};')
		.replace("await import('../src-js/config.js')", '({ loadConfig: () => ({}) })')
		.replace("await import('../src-js/server/api/openapi/gen-spec.js')", `({ genOpenapiSpec: () => {
			setInterval(() => {}, 10_000);
			${fail ? 'throw new Error("generation failed");' : 'return { openapi: "3.1.0" };'}
		} })`);
	try {
		const result = spawnSync(process.execPath, ['--input-type=module', '-', '--no-build'], {
			input: script,
			cwd: directory,
			encoding: 'utf8',
			timeout: 5_000,
		});
		return {
			...result,
			spec: result.status === 0 ? JSON.parse(readFileSync(join(directory, 'built/api.json'), 'utf8')) : null,
		};
	} finally {
		rmSync(directory, { recursive: true });
	}
}

describe('API JSON generation CLI lifecycle', () => {
	test('exits successfully after writing the spec even when imported endpoints retain timers', () => {
		const result = runGenerator(false);
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
		expect(result.spec).toEqual({ openapi: '3.1.0' });
	});

	test('reports generation errors instead of returning success', () => {
		const result = runGenerator(true);
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('generation failed');
	});
});
