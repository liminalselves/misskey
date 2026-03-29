/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const misskeyJsBuilt = join(__dirname, '../../misskey-js/built/index.js');
const repoRoot = join(__dirname, '../../..');

if (!existsSync(misskeyJsBuilt)) {
	console.info('[sw] misskey-js/built not found; building misskey-js...');
	execSync('pnpm --filter misskey-js build', { cwd: repoRoot, stdio: 'inherit', shell: true });
}
