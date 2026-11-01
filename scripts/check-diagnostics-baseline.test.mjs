/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { checkBaseline } from './check-diagnostics-baseline.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = join(root, 'scripts/check-diagnostics-baseline.mjs');
const workflows = Object.fromEntries(await Promise.all(['backend-diagnostics.inspect', 'backend-diagnostics.comment', 'frontend-diagnostics.inspect', 'lint'].map(async name => [name, load(await readFile(join(root, `.github/workflows/${name}.yml`), 'utf8'))])));
const backendSteps = workflows['backend-diagnostics.inspect'].jobs['get-memory-usage'].steps;
const frontendSteps = workflows['frontend-diagnostics.inspect'].jobs.report.steps;
const supported = "steps.baseline.outputs.supported == 'true'";
const unsupported = "steps.baseline.outputs.supported == 'false'";
const modern = {
	'package.json': JSON.stringify({ name: 'misskey' }),
	'packages/backend/package.json': JSON.stringify({ scripts: { start: 'pnpm compile-config && node ./built/entry.js' } }),
	'packages/backend/src/boot/entry.ts': "process.send('ok'); process.send('gc ok'); process.send({ type: 'memory usage' }); process.send({ type: 'heap snapshot' });",
	'packages/backend/src/env.ts': 'const options = { disableClustering: false, onlyServer: false, noDaemons: false };',
	'packages/frontend/vite.config.ts': "import { visualizer } from 'rollup-plugin-visualizer'; visualizer({ filename: process.env.FRONTEND_BUNDLE_VISUALIZER_FILE }); const enabled = process.env.FRONTEND_BUNDLE_VISUALIZER;",
};

async function fixture(t, overrides = {}) {
	const temp = await mkdtemp(join(tmpdir(), 'misskey-diagnostics-'));
	t.after(() => rm(temp, { recursive: true, force: true }));
	const base = join(temp, '基线 含空格');
	for (const [name, value] of Object.entries({ ...modern, ...overrides })) {
		if (value === null) continue;
		const path = join(base, name);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, value, 'utf8');
	}
	return { temp, base };
}

function step(steps, name) {
	const found = steps.find(value => value.name === name);
	assert.ok(found, `Missing workflow step: ${name}`);
	return found;
}

test('the current checkout supports both diagnostic harnesses', async () => {
	assert.equal((await checkBaseline('backend', root)).supported, true);
	assert.equal((await checkBaseline('frontend', root)).supported, true);
});

test('legacy backend layout is unavailable even if IPC messages exist', async t => {
	const { base } = await fixture(t, { 'packages/backend/package.json': JSON.stringify({ scripts: { start: 'node ./built/boot/entry.js' } }) });
	const result = await checkBaseline('backend', base);
	assert.equal(result.supported, false);
	assert.ok(result.missing.some(value => value.includes('built/entry.js')));
});

for (const message of ['ok', 'gc ok', 'memory usage', 'heap snapshot']) {
	test(`missing backend IPC capability is not comparable: ${message}`, async t => {
		const { base } = await fixture(t, { 'packages/backend/src/boot/entry.ts': modern['packages/backend/src/boot/entry.ts'].replaceAll(`'${message}'`, "'other'") });
		assert.equal((await checkBaseline('backend', base)).supported, false);
	});
}

test('a baseline without daemon suppression is not started by the harness', async t => {
	const { base } = await fixture(t, { 'packages/backend/src/env.ts': 'const options = { onlyServer: false, disableClustering: false };' });
	assert.equal((await checkBaseline('backend', base)).supported, false);
});

test('setting the output environment variable is insufficient without visualizer integration', async t => {
	const { base } = await fixture(t, { 'packages/frontend/vite.config.ts': 'const output = process.env.FRONTEND_BUNDLE_VISUALIZER_FILE;' });
	assert.equal((await checkBaseline('frontend', base)).supported, false);
});

test('missing optional legacy source files produce an explicit unavailable result', async t => {
	const { base } = await fixture(t, { 'packages/frontend/vite.config.ts': null });
	assert.equal((await checkBaseline('frontend', base)).supported, false);
});

test('malformed manifests and missing checkouts remain failures', async t => {
	const { temp, base } = await fixture(t, { 'packages/backend/package.json': '{invalid' });
	await assert.rejects(checkBaseline('backend', base), SyntaxError);
	await assert.rejects(checkBaseline('frontend', join(temp, 'missing')));
	await assert.rejects(checkBaseline('unknown', base), /Unknown diagnostics kind/);
});

for (const kind of ['backend', 'frontend']) {
	test(`CLI produces N/A without fake metrics for an old ${kind} baseline`, async t => {
		const { temp, base } = await fixture(t, {
			'packages/backend/package.json': JSON.stringify({ scripts: { start: 'node ./built/boot/entry.js' } }),
			'packages/frontend/vite.config.ts': 'export default {};',
		});
		const report = join(temp, 'reports/unavailable.md');
		const output = join(temp, 'github-output');
		const result = spawnSync(process.execPath, [script, kind, base, report], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output } });
		assert.equal(result.status, 0, result.stderr);
		assert.equal(await readFile(output, 'utf8'), 'supported=false\n');
		const markdown = await readFile(report, 'utf8');
		assert.match(markdown, /diagnostics: N\/A/);
		assert.match(markdown, /not a zero delta or a performance pass/);
		assert.equal(JSON.parse(result.stdout).supported, false);
	});
}

test('CLI reports malformed baselines as failures, not N/A', async t => {
	const { temp, base } = await fixture(t, { 'packages/backend/package.json': '{invalid' });
	const report = join(temp, 'unavailable.md');
	const output = join(temp, 'github-output');
	const result = spawnSync(process.execPath, [script, 'backend', base, report], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output } });
	assert.notEqual(result.status, 0);
	await assert.rejects(readFile(output), { code: 'ENOENT' });
	await assert.rejects(readFile(report), { code: 'ENOENT' });
});

test('an unavailable-report write failure is not treated as a successful capability check', async t => {
	const { temp, base } = await fixture(t, { 'packages/frontend/vite.config.ts': 'export default {};' });
	const blocked = join(temp, 'not-a-directory');
	await writeFile(blocked, 'owned fixture', 'utf8');
	const output = join(temp, 'github-output');
	const result = spawnSync(process.execPath, [script, 'frontend', base, join(blocked, 'report.md')], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output } });
	assert.notEqual(result.status, 0);
	await assert.rejects(readFile(output), { code: 'ENOENT' });
});

test('CLI permits normal comparison without producing an unavailable report', async t => {
	const { temp, base } = await fixture(t);
	const report = join(temp, 'unavailable.md');
	const output = join(temp, 'github-output');
	const result = spawnSync(process.execPath, [script, 'backend', base, report], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output } });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(await readFile(output, 'utf8'), 'supported=true\n');
	await assert.rejects(readFile(report), { code: 'ENOENT' });
});

test('workflow gates only comparison prerequisites and preserves head build failures', () => {
	for (const [steps, names] of [[backendSteps, ['Install base dependencies', 'Build base', 'Measure backend memory usage', 'Upload base heap snapshot', 'Upload head heap snapshot', 'Upload Artifact']], [frontendSteps, ['Install dependencies for base', 'Build base', 'Measure frontend browser metrics', 'Generate frontend diagnostics report', 'Upload browser base heap snapshot', 'Upload browser head heap snapshot']]]) {
		for (const name of names) {
			assert.equal(step(steps, name).if, supported);
			assert.notEqual(step(steps, name)['continue-on-error'], true);
		}
		for (const name of steps === backendSteps ? ['Install head dependencies', 'Build head'] : ['Install dependencies for head', 'Build head']) {
			assert.equal(step(steps, name).if, undefined);
			assert.notEqual(step(steps, name)['continue-on-error'], true);
		}
	}
	assert.equal(step(backendSteps, 'Upload unavailable comparison').if, unsupported);
	assert.equal(step(frontendSteps, 'Write report metadata').if, undefined);
	assert.equal(step(frontendSteps, 'Upload frontend diagnostics report').if, undefined);
	assert.match(step(frontendSteps, 'Check frontend diagnostics report').run, /BASELINE_SUPPORTED/);
	assert.ok(workflows.lint.jobs['check-dts'].steps.some(value => value.run?.includes('scripts/check-diagnostics-baseline.test.mjs')));
});

test('backend report consumer handles N/A without searching for missing snapshots', () => {
	const steps = workflows['backend-diagnostics.comment'].jobs['compare-memory'].steps;
	assert.match(step(steps, 'Resolve comparison availability').run, /comparison-unavailable\.md/);
	assert.equal(step(steps, 'Find heap snapshot artifacts').if, "steps.comparison.outputs.supported == 'true'");
	assert.equal(step(steps, 'Build memory comment').if, "steps.comparison.outputs.supported == 'true'");
});
