/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 流式读取上游响应体并在超过上限时中止：防止恶意/异常上游返回超大 body 被完整缓冲进内存。
 * 超限时取消底层流并抛出 UpstreamBodyTooLargeError，调用方应将其归为上游错误处理。
 */
export class UpstreamBodyTooLargeError extends Error {
	public override readonly name = 'UpstreamBodyTooLargeError';
	constructor(public readonly limitBytes: number) {
		super(`Upstream response body exceeded the ${limitBytes} byte limit.`);
	}
}

export async function readBodyWithLimit(res: Response, limitBytes: number): Promise<Buffer> {
	const reader = res.body?.getReader();
	if (reader == null) {
		// 无 body 流（如某些 304/204 或运行时不支持）时退化为一次性读取，仍受上限约束
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.byteLength > limitBytes) throw new UpstreamBodyTooLargeError(limitBytes);
		return buf;
	}
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value.byteLength === 0) continue;
		total += value.byteLength;
		if (total > limitBytes) {
			await reader.cancel().catch(() => {});
			throw new UpstreamBodyTooLargeError(limitBytes);
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks.map(c => Buffer.from(c)), total);
}
