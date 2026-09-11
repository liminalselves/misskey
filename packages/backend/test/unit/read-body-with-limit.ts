/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Readable } from 'node:stream';
import { readBodyWithLimit, UpstreamBodyTooLargeError } from '@/misc/read-body-with-limit.js';

describe('readBodyWithLimit', () => {
	const LIMIT = 16;

	function webStreamRes(chunks: Uint8Array[]) {
		return {
			body: {
				getReader: () => {
					let i = 0;
					return {
						read: async () => i < chunks.length
							? { done: false, value: chunks[i++] }
							: { done: true, value: undefined },
						cancel: async () => {},
					};
				},
			},
			arrayBuffer: async () => new ArrayBuffer(0),
		};
	}

	test('Web ReadableStream: 正常读取并拼接', async () => {
		const buf = await readBodyWithLimit(webStreamRes([new Uint8Array([1, 2]), new Uint8Array([3])]), LIMIT);
		expect([...buf]).toEqual([1, 2, 3]);
	});

	test('Web ReadableStream: 超限抛 UpstreamBodyTooLargeError', async () => {
		const big = new Uint8Array(LIMIT + 1);
		await expect(readBodyWithLimit(webStreamRes([big]), LIMIT)).rejects.toBeInstanceOf(UpstreamBodyTooLargeError);
	});

	test('Node Readable（node-fetch 形态）: 正常读取', async () => {
		const res = {
			body: Readable.from([Buffer.from('hello '), Buffer.from('world')]),
			arrayBuffer: async () => new ArrayBuffer(0),
		};
		const buf = await readBodyWithLimit(res, LIMIT);
		expect(buf.toString('utf8')).toBe('hello world');
	});

	test('Node Readable: 超限抛错并销毁流', async () => {
		const stream = Readable.from([Buffer.alloc(LIMIT), Buffer.alloc(1)]);
		let destroyed = false;
		const origDestroy = stream.destroy.bind(stream);
		stream.destroy = ((...args: Parameters<Readable['destroy']>) => {
			destroyed = true;
			return origDestroy(...args);
		}) as Readable['destroy'];
		const res = { body: stream, arrayBuffer: async () => new ArrayBuffer(0) };
		await expect(readBodyWithLimit(res, LIMIT)).rejects.toBeInstanceOf(UpstreamBodyTooLargeError);
		expect(destroyed).toBe(true);
	});

	test('Node Readable 恰好等于上限不抛错', async () => {
		const res = {
			body: Readable.from([Buffer.alloc(LIMIT)]),
			arrayBuffer: async () => new ArrayBuffer(0),
		};
		const buf = await readBodyWithLimit(res, LIMIT);
		expect(buf.byteLength).toBe(LIMIT);
	});

	test('无 body 时回退 arrayBuffer，且仍受上限约束', async () => {
		const okRes = {
			arrayBuffer: async () => new TextEncoder().encode('abc').buffer as ArrayBuffer,
		};
		expect((await readBodyWithLimit(okRes, LIMIT)).toString('utf8')).toBe('abc');

		const bigRes = {
			arrayBuffer: async () => new Uint8Array(LIMIT + 1).buffer as ArrayBuffer,
		};
		await expect(readBodyWithLimit(bigRes, LIMIT)).rejects.toBeInstanceOf(UpstreamBodyTooLargeError);
	});
});
