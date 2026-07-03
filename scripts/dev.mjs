/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { dirname } from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

function parsePort(value) {
	const port = Number(value);
	return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function isPortAvailable(port) {
	return new Promise(resolve => {
		const server = net.createServer();

		server.once('error', () => resolve(false));
		server.once('listening', () => {
			server.close(() => resolve(true));
		});
		server.listen(port, '0.0.0.0');
	});
}

const reservedDevPorts = new Set();

async function resolveDevPort(envName, defaultPort) {
	const configuredPort = parsePort(process.env[envName]);
	if (process.env[envName]) {
		if (configuredPort == null) {
			console.warn(`[dev] Ignoring invalid ${envName}=${process.env[envName]}; falling back to ${defaultPort}.`);
		} else {
			defaultPort = configuredPort;
		}
	}

	let port = defaultPort;
	while (reservedDevPorts.has(port) || !(await isPortAvailable(port))) {
		port++;
	}

	process.env[envName] = String(port);
	reservedDevPorts.add(port);
	if (port !== defaultPort) {
		console.warn(`[dev] Port ${defaultPort} is already in use; using ${port} for ${envName}.`);
	}

	return port;
}

await resolveDevPort('VITE_PORT', 5173);
await resolveDevPort('EMBED_VITE_PORT', 5174);

await execa('pnpm', ['clean'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

// アセットのビルドで依存しているので一番最初に必要
await execa('pnpm', ['--filter', 'i18n', 'build'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

// build-assets bundles the service worker, which imports misskey-js.
// After clean, misskey-js must exist before build-assets starts.
await execa('pnpm', ['--filter', 'misskey-js', 'build'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

await Promise.all([
	execa('pnpm', ['build-pre'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),
	execa('pnpm', ['build-assets'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),
	execa('pnpm', ['--filter', 'backend...', 'build'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),
	// icons-subsetterは開発段階では使用されないが、型エラーを抑制するためにはじめの一度だけビルドする
	execa('pnpm', ['--filter', 'icons-subsetter', 'build'], {
		cwd: _dirname + '/../',
		stdout: process.stdout,
		stderr: process.stderr,
	}),
]);

execa('pnpm', ['build-pre', '--watch'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('pnpm', ['build-assets', '--watch'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('pnpm', ['--filter', 'backend', 'dev'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('pnpm', ['--filter', 'frontend-shared', 'watch', '--no-clean'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('pnpm', ['--filter', 'frontend', 'watch'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('pnpm', ['--filter', 'frontend-embed', 'watch'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('pnpm', ['--filter', 'sw', 'watch'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('pnpm', ['--filter', 'misskey-js', 'watch', '--no-clean'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('pnpm', ['--filter', 'i18n', 'watch', '--no-clean'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('pnpm', ['--filter', 'misskey-reversi', 'watch', '--no-clean'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});

execa('pnpm', ['--filter', 'misskey-bubble-game', 'watch', '--no-clean'], {
	cwd: _dirname + '/../',
	stdout: process.stdout,
	stderr: process.stderr,
});
