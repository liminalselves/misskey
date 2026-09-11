/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 流式读取上游响应体并在超过上限时中止：防止恶意/异常上游返回超大 body 被完整缓冲进内存。
 * 超限时取消底层流并抛出 UpstreamBodyTooLargeError，调用方应将其归为上游错误处理。
 * body 支持两种形态：全局 fetch（undici）的 Web ReadableStream 与 node-fetch 的 Node 流。
 */
export class UpstreamBodyTooLargeError extends Error {
	public override readonly name = 'UpstreamBodyTooLargeError';
	constructor(public readonly limitBytes: number) {
		super(`Upstream response body exceeded the ${limitBytes} byte limit.`);
	}
}

type LimitedBodySource = {
	arrayBuffer: () => Promise<ArrayBuffer>;
	body?: unknown;
};

export async function readBodyWithLimit(res: LimitedBodySource, limitBytes: number): Promise<Buffer> {
	const body = res.body as (
		| { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }>; cancel: () => Promise<unknown> } }
		| AsyncIterable<Uint8Array>
		| null
		| undefined
	);

	if (body != null && typeof (body as { getReader?: unknown }).getReader === 'function') {
		// Web ReadableStream（全局 fetch）
		const reader = (body as { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }>; cancel: () => Promise<unknown> } }).getReader();
		const chunks: Uint8Array[] = [];
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value == null || value.byteLength === 0) continue;
			total += value.byteLength;
			if (total > limitBytes) {
				await reader.cancel().catch(() => {});
				throw new UpstreamBodyTooLargeError(limitBytes);
			}
			chunks.push(value);
		}
		return Buffer.concat(chunks.map(c => Buffer.from(c)), total);
	}

	if (body != null && typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function') {
		// Node.js Readable（node-fetch）
		const stream = body as AsyncIterable<Uint8Array> & { destroy?: (err?: Error) => void };
		const chunks: Buffer[] = [];
		let total = 0;
		try {
			for await (const chunk of stream) {
				if (chunk == null || chunk.byteLength === 0) continue;
				total += chunk.byteLength;
				if (total > limitBytes) throw new UpstreamBodyTooLargeError(limitBytes);
				chunks.push(Buffer.from(chunk));
			}
		} finally {
			if (typeof stream.destroy === 'function') stream.destroy();
		}
		return Buffer.concat(chunks, total);
	}

	// 无 body 流（如某些 304/204 或运行时不支持）时退化为一次性读取，仍受上限约束
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.byteLength > limitBytes) throw new UpstreamBodyTooLargeError(limitBytes);
	return buf;
}
