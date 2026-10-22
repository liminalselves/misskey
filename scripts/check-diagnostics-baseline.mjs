/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

async function readOptional(path) {
	try {
		return await readFile(path, 'utf8');
	} catch (error) {
		if (error.code === 'ENOENT') return '';
		throw error;
	}
}

export async function checkBaseline(kind, baseDir) {
	if (!['backend', 'frontend'].includes(kind)) throw new Error('Unknown diagnostics kind.');
	if (!(await stat(baseDir)).isDirectory()) throw new Error('Baseline must be a directory.');
	JSON.parse(await readFile(join(baseDir, 'package.json'), 'utf8'));
	const missing = [];
	if (kind === 'backend') {
		const pkg = JSON.parse(await readFile(join(baseDir, 'packages/backend/package.json'), 'utf8'));
		const entry = await readOptional(join(baseDir, 'packages/backend/src/boot/entry.ts'));
		const env = await readOptional(join(baseDir, 'packages/backend/src/env.ts'));
		if (!pkg.scripts?.start?.includes('node ./built/entry.js')) missing.push('the built/entry.js backend layout');
		for (const message of ['ok', 'gc ok', 'memory usage', 'heap snapshot']) {
			if (!entry.includes(`'${message}'`) && !entry.includes(`"${message}"`)) missing.push(`the ${message} IPC protocol`);
		}
		for (const option of ['disableClustering', 'onlyServer', 'noDaemons']) {
			if (!env.includes(`${option}:`)) missing.push(`the ${option} runtime option`);
		}
	} else {
		const config = await readOptional(join(baseDir, 'packages/frontend/vite.config.ts'));
		for (const feature of ['rollup-plugin-visualizer', 'FRONTEND_BUNDLE_VISUALIZER', 'FRONTEND_BUNDLE_VISUALIZER_FILE']) {
			if (!config.includes(feature)) missing.push(`the ${feature} bundle statistics integration`);
		}
	}
	return { supported: missing.length === 0, missing };
}

export function unavailableReport(kind, missing) {
	return [
		`## ${kind === 'backend' ? 'Backend' : 'Frontend'} diagnostics: N/A`,
		'',
		'The baseline does not support the current comparison harness:',
		...missing.map(feature => `- Missing ${feature}.`),
		'',
		'No comparison metrics or heap snapshots were generated. N/A is not a zero delta or a performance pass.',
		'The head build and the separate business build/test workflows remain required. Compatible baselines still run strict measurements and artifact checks.',
		'',
	].join('\n');
}

async function main() {
	const [kind, baseDir, reportPath, ...extra] = process.argv.slice(2);
	if (!kind || !baseDir || !reportPath || extra.length > 0) {
		throw new Error('Usage: node check-diagnostics-baseline.mjs <backend|frontend> <base-dir> <unavailable-report.md>');
	}
	const result = await checkBaseline(kind, resolve(baseDir));
	if (!result.supported) {
		await mkdir(dirname(resolve(reportPath)), { recursive: true });
		await writeFile(reportPath, unavailableReport(kind, result.missing), 'utf8');
	}
	if (process.env.GITHUB_OUTPUT) {
		await appendFile(process.env.GITHUB_OUTPUT, `supported=${result.supported}\n`, 'utf8');
	}
	console.log(JSON.stringify({ kind, ...result }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	main().catch(error => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
