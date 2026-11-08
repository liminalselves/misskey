/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { DriveMissingObjectService, MISSING_CONFIRM_DELAY_MS, REPAIR_HOURLY_LIMIT } from '@/core/DriveMissingObjectService.js';
import { DriveService } from '@/core/DriveService.js';

//#region fakes
class FakeRedis {
	private store = new Map<string, { v: string; exp: number | null }>();
	private zsets = new Map<string, Map<string, number>>();

	private live(key: string) {
		const e = this.store.get(key);
		if (e && e.exp != null && e.exp <= Date.now()) {
			this.store.delete(key);
			return undefined;
		}
		return e;
	}

	async set(key: string, value: string, ...args: (string | number)[]) {
		const nx = args.includes('NX');
		const exIdx = args.indexOf('EX');
		if (nx && this.live(key)) return null;
		this.store.set(key, { v: value, exp: exIdx >= 0 ? Date.now() + Number(args[exIdx + 1]) * 1000 : null });
		return 'OK';
	}
	async get(key: string) { return this.live(key)?.v ?? null; }
	async del(key: string) { return this.store.delete(key) ? 1 : 0; }
	async exists(key: string) { return this.live(key) ? 1 : 0; }
	async incr(key: string) {
		const cur = Number(this.live(key)?.v ?? 0) + 1;
		const e = this.store.get(key);
		this.store.set(key, { v: String(cur), exp: e?.exp ?? null });
		return cur;
	}
	async decr(key: string) {
		const cur = Number(this.live(key)?.v ?? 0) - 1;
		const e = this.store.get(key);
		this.store.set(key, { v: String(cur), exp: e?.exp ?? null });
		return cur;
	}
	async expire(key: string, seconds: number) {
		const e = this.live(key);
		if (e) e.exp = Date.now() + seconds * 1000;
		return e ? 1 : 0;
	}
	async zadd(key: string, score: number, member: string) {
		const z = this.zsets.get(key) ?? new Map<string, number>();
		z.set(member, score);
		this.zsets.set(key, z);
		return 1;
	}
	async zremrangebyscore(key: string, min: number, max: number) {
		const z = this.zsets.get(key);
		if (!z) return 0;
		let n = 0;
		for (const [m, s] of z) if (s >= min && s <= max) { z.delete(m); n++; }
		return n;
	}
	async zcard(key: string) { return this.zsets.get(key)?.size ?? 0; }
}

const BASE = 'http://oss.example.top/bucket-a';

function makeFile(n: number, overrides: Record<string, unknown> = {}) {
	return {
		id: `file${n}`,
		userId: `user${n}`,
		userHost: null,
		storedInternal: false,
		isLink: false,
		type: 'image/webp',
		accessKey: `misskey/obj${n}.webp`,
		url: `${BASE}/misskey/obj${n}.webp`,
		thumbnailUrl: `${BASE}/misskey/thumbnail-obj${n}.webp`,
		webpublicUrl: null,
		...overrides,
	};
}

function notFound() {
	return Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
}

type Harness = ReturnType<typeof setup>;

function setup(opts: { useObjectStorage?: boolean } = {}) {
	const redis = new FakeRedis();
	/** key -> 对象是否存在；不在表里的 key 视为存在（用作金丝雀） */
	const objects = new Map<string, 'present' | 'missing' | Error>();
	const head = vi.fn(async (_meta: unknown, input: { Key: string }) => {
		const state = objects.get(input.Key) ?? 'present';
		if (state === 'present') return {};
		if (state === 'missing') throw notFound();
		throw state;
	});

	const files = new Map<string, ReturnType<typeof makeFile>>();
	const repo = {
		findOneBy: vi.fn(async ({ id }: { id: string }) => files.get(id) ?? null),
		createQueryBuilder: vi.fn(() => {
				const params: { url?: string } = {};
				const qb: Record<string, unknown> = {};
				const self = () => qb;
				const capture = (_sql: string, p?: { url?: string }) => { if (p?.url) params.url = p.url; return self(); };
				qb.where = vi.fn(capture);
				qb.orWhere = vi.fn(capture);
				// Brackets 把 URL 条件放在回调里：用同一个收集器执行它
				qb.andWhere = vi.fn((arg: unknown, p?: { url?: string }) => {
					const whereFactory = (arg as { whereFactory?: (b: unknown) => unknown } | null)?.whereFactory;
					if (typeof whereFactory === 'function') whereFactory(qb);
					else capture('', p);
					return self();
				});
			qb.orderBy = vi.fn(self);
			qb.limit = vi.fn(self);
			qb.getOne = vi.fn(async () => [...files.values()].find(f => f.url === params.url || f.thumbnailUrl === params.url || f.webpublicUrl === params.url) ?? null);
			qb.getMany = vi.fn(async () => [...files.values()].reverse());
			return qb;
		}),
	};

	const driveService = { deleteFileWithMissingObject: vi.fn(async (file: { id: string }) => { files.delete(file.id); return true; }) };
	const announcementService = { create: vi.fn(async () => ({})) };
	const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), succ: vi.fn() };
	const loggerService = { getLogger: () => logger };
	const config = { url: 'https://site.example.com' };
	const meta = {
		useObjectStorage: opts.useObjectStorage ?? true,
		objectStorageBaseUrl: BASE,
		objectStorageBucket: 'bucket-a',
		objectStorageEndpoint: 'oss.example.top',
		objectStoragePort: null,
		objectStorageUseSSL: false,
		objectStorageS3ForcePathStyle: true,
		objectStorageRegion: 'cn-guangzhou',
		objectStorageAccessKey: 'ak',
		objectStorageSecretKey: 'sk',
	};
	const s3Service = { head };

	const service = new DriveMissingObjectService(
		config as never, meta as never, repo as never, redis as never,
		s3Service as never, driveService as never, announcementService as never, loggerService as never,
	);

	const add = (n: number, overrides: Record<string, unknown> = {}) => {
		const f = makeFile(n, overrides);
		files.set(f.id, f);
		return f;
	};
	return { service, redis, objects, head, files, repo, driveService, announcementService, logger, meta, add };
}

/** 一个文件走完「首次发现 -> 等待 -> 二次确认」 */
async function confirmMissing(h: Harness, file: ReturnType<typeof makeFile>) {
	h.objects.set(file.accessKey, 'missing');
	const first = await h.service.checkFile(file as never);
	vi.advanceTimersByTime(MISSING_CONFIRM_DELAY_MS + 1000);
	const second = await h.service.checkFile(file as never);
	return { first, second };
}
//#endregion

describe('DriveMissingObjectService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// 整点开始，方便测试小时限额
		vi.setSystemTime(new Date('2026-11-08T10:00:00.000Z'));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	describe('preconditions: never touch what it should not look at', () => {
		test('ignores everything when object storage is disabled', async () => {
			const h = setup({ useObjectStorage: false });
			const file = h.add(1);
			expect(await h.service.checkFile(file as never)).toBe('ignored');
			expect(h.head).not.toHaveBeenCalled();
		});

		test.each([
			['internally stored', { storedInternal: true }],
			['a remote link', { isLink: true }],
			['owned by a remote user', { userHost: 'remote.example' }],
			['without an access key', { accessKey: null }],
		])('ignores a file that is %s', async (_name, overrides) => {
			const h = setup();
			const file = h.add(1, overrides);
			expect(await h.service.checkFile(file as never)).toBe('ignored');
			expect(h.head).not.toHaveBeenCalled();
		});

		test('ignores a file whose url belongs to another bucket or host', async () => {
			const h = setup();
			const file = h.add(1, { url: 'http://old-oss.example.top/bucket-old/misskey/obj1.webp' });
			expect(await h.service.checkFile(file as never)).toBe('ignored');
			expect(h.head).not.toHaveBeenCalled();
		});

		test('ignores a file whose access key disagrees with its url', async () => {
			const h = setup();
			const file = h.add(1, { accessKey: 'misskey/something-else.webp' });
			expect(await h.service.checkFile(file as never)).toBe('ignored');
			expect(h.head).not.toHaveBeenCalled();
		});
	});

	describe('files left in a previous bucket (production has such records)', () => {
		const legacy = (n: number) => ({ url: `http://oss.example.top/old-bucket/misskey/obj${n}.webp` });

		test('probes the legacy bucket itself and repairs after the two-step confirmation', async () => {
			const h = setup();
			const file = h.add(1, legacy(1));
			h.add(2); // 当前桶里的金丝雀
			h.objects.set(file.accessKey, 'missing');

			expect(await h.service.checkFile(file as never)).toBe('suspected');
			expect(h.head).toHaveBeenCalledWith(expect.anything(), { Bucket: 'old-bucket', Key: file.accessKey });
			vi.advanceTimersByTime(MISSING_CONFIRM_DELAY_MS + 1000);
			expect(await h.service.checkFile(file as never)).toBe('repaired');
			expect(h.driveService.deleteFileWithMissingObject).toHaveBeenCalledTimes(1);
		});

		test('uses a current-bucket object, never a legacy one, as the health canary', async () => {
			const h = setup();
			const file = h.add(1, legacy(1));
			// 唯一能对照的另一个文件也在遗留桶：不能证明端点健康，所以不修复
			h.add(2, legacy(2));
			h.objects.set(file.accessKey, 'missing');
			expect(await h.service.checkFile(file as never)).toBe('unknown');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test('an object that exists in the legacy bucket is left alone', async () => {
			const h = setup();
			const file = h.add(1, legacy(1));
			h.add(2);
			expect(await h.service.checkFile(file as never)).toBe('present');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test('legacy access is not attempted without path-style addressing', async () => {
			const h = setup();
			Object.assign(h.meta, { objectStorageS3ForcePathStyle: false });
			const file = h.add(1, legacy(1));
			expect(await h.service.checkFile(file as never)).toBe('ignored');
			expect(h.head).not.toHaveBeenCalled();
		});

		test('a thumbnail url of a legacy file still resolves to its owner file', async () => {
			const h = setup();
			const file = h.add(1, { ...legacy(1), thumbnailUrl: 'http://oss.example.top/old-bucket/misskey/thumbnail-obj1.webp' });
			h.add(2);
			expect(await h.service.checkByReportedUrl(file.thumbnailUrl)).toBe('present');
			expect(h.head).toHaveBeenCalledWith(expect.anything(), { Bucket: 'old-bucket', Key: file.accessKey });
		});
	});

	describe('uncertain probe results never change data', () => {
		test('object present clears any suspicion', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2); // 金丝雀
			h.objects.set(file.accessKey, 'missing');
			expect(await h.service.checkFile(file as never)).toBe('suspected');
			vi.advanceTimersByTime(MISSING_CONFIRM_DELAY_MS + 1000);
			h.objects.set(file.accessKey, 'present');
			expect(await h.service.checkFile(file as never)).toBe('present');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
			expect(await h.redis.get(`drive:missing:suspect:${file.id}`)).toBeNull();
		});

		test.each([
			['access denied', Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })],
			['server error', Object.assign(new Error('boom'), { name: 'InternalError', $metadata: { httpStatusCode: 500 } })],
			['throttling', Object.assign(new Error('slow'), { name: 'SlowDown', $metadata: { httpStatusCode: 429 } })],
			['timeout', Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
			['network reset', Object.assign(new Error('reset'), { code: 'ECONNRESET' })],
			['no such bucket', Object.assign(new Error('bucket'), { name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } })],
		])('%s is treated as unknown and nothing is recorded', async (_name, err) => {
			const h = setup();
			const file = h.add(1);
			h.objects.set(file.accessKey, err);
			expect(await h.service.checkFile(file as never)).toBe('unknown');
			expect(await h.redis.get(`drive:missing:suspect:${file.id}`)).toBeNull();
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test('an unexpected exception is swallowed and reported as unknown', async () => {
			const h = setup();
			const file = h.add(1);
			h.repo.createQueryBuilder.mockImplementation(() => { throw new Error('db down'); });
			h.objects.set(file.accessKey, 'missing');
			await expect(h.service.checkFile(file as never)).resolves.toBe('unknown');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});
	});

	describe('bucket health canary', () => {
		test('a missing object is not trusted when no other object can be confirmed present', async () => {
			const h = setup();
			const file = h.add(1);
			h.objects.set(file.accessKey, 'missing');
			// 没有任何其他文件可做金丝雀
			expect(await h.service.checkFile(file as never)).toBe('unknown');
			expect(await h.redis.get(`drive:missing:suspect:${file.id}`)).toBeNull();
		});

		test('a failing canary (credentials/network problem) blocks the repair', async () => {
			const h = setup();
			const file = h.add(1);
			const other = h.add(2);
			h.objects.set(file.accessKey, 'missing');
			h.objects.set(other.accessKey, Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }));
			expect(await h.service.checkFile(file as never)).toBe('unknown');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test('a canary that is itself missing does not count as healthy', async () => {
			const h = setup();
			const file = h.add(1);
			const other = h.add(2);
			h.objects.set(file.accessKey, 'missing');
			h.objects.set(other.accessKey, 'missing');
			expect(await h.service.checkFile(file as never)).toBe('unknown');
		});

		test('a canary from another bucket is ignored', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2, { url: 'http://elsewhere.example.top/b/misskey/obj2.webp' });
			h.objects.set(file.accessKey, 'missing');
			expect(await h.service.checkFile(file as never)).toBe('unknown');
		});
	});

	describe('two-step confirmation', () => {
		test('repairs only after a second confirmation, and notifies the owner once', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2); // 金丝雀
			const { first, second } = await confirmMissing(h, file);

			expect(first).toBe('suspected');
			expect(second).toBe('repaired');
			expect(h.driveService.deleteFileWithMissingObject).toHaveBeenCalledTimes(1);
			expect(h.announcementService.create).toHaveBeenCalledTimes(1);
			expect(h.announcementService.create).toHaveBeenCalledWith(expect.objectContaining({
				userId: 'user1',
				text: '因相关审查原因，您网盘中的部分图片已被删除。',
				silence: false,
				needConfirmationToRead: false,
			}));
		});

		test('a second check before the delay elapses does not repair', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			expect(await h.service.checkFile(file as never)).toBe('suspected');
			vi.advanceTimersByTime(40_000); // 过了 30s 冷却，但不到 60s 确认间隔
			expect(await h.service.checkFile(file as never)).toBe('suspected');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test('checks inside the cooldown are skipped without calling the object storage', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			await h.service.checkFile(file as never);
			const calls = h.head.mock.calls.length;
			vi.advanceTimersByTime(5_000);
			expect(await h.service.checkFile(file as never)).toBe('skipped');
			expect(h.head.mock.calls.length).toBe(calls);
		});

		test('suspicion expires, so a long-delayed check starts over instead of deleting', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			expect(await h.service.checkFile(file as never)).toBe('suspected');
			vi.advanceTimersByTime(20 * 60 * 1000);
			expect(await h.service.checkFile(file as never)).toBe('suspected');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test.each([
			['the bucket', { objectStorageBucket: 'bucket-b' }],
			['the endpoint', { objectStorageEndpoint: 'other.example.com' }],
			['the region', { objectStorageRegion: 'cn-beijing' }],
			['the access key', { objectStorageAccessKey: 'ak-new' }],
			['the secret key', { objectStorageSecretKey: 'sk-new' }],
		])('changing %s between the two checks voids the pending confirmation', async (_name, change) => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			expect(await h.service.checkFile(file as never)).toBe('suspected');
			vi.advanceTimersByTime(MISSING_CONFIRM_DELAY_MS + 1000);

			Object.assign(h.meta, change);
			// 配置变了：这次只能重新开始计时，不能沿用旧配置下的确认直接删除
			expect(await h.service.checkFile(file as never)).toBe('suspected');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test('an unchanged configuration keeps the pending confirmation valid', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			const { first, second } = await confirmMissing(h, file);
			expect([first, second]).toEqual(['suspected', 'repaired']);
		});

		test('an object that reappears between the two checks is never deleted', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			await h.service.checkFile(file as never);
			vi.advanceTimersByTime(MISSING_CONFIRM_DELAY_MS + 1000);
			h.objects.delete(file.accessKey); // 对象恢复
			expect(await h.service.checkFile(file as never)).toBe('present');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test('concurrent checks of the same file only probe once', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			const results = await Promise.all([
				h.service.checkFile(file as never),
				h.service.checkFile(file as never),
				h.service.checkFile(file as never),
			]);
			expect(results.filter(r => r === 'suspected')).toHaveLength(1);
			expect(results.filter(r => r === 'skipped')).toHaveLength(2);
		});
	});

	describe('repair outcome', () => {
		test('when the row changed under us the repair is reported as ignored and nobody is notified', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.driveService.deleteFileWithMissingObject.mockResolvedValueOnce(false);
			const { second } = await confirmMissing(h, file);
			expect(second).toBe('ignored');
			expect(h.announcementService.create).not.toHaveBeenCalled();
		});

		test('a repair that throws gives its hourly quota back and is reported as unknown', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.driveService.deleteFileWithMissingObject.mockRejectedValueOnce(new Error('db unavailable'));
			const hourKey = `drive:missing:hourly:${Math.floor(Date.now() / 3_600_000)}`;

			const { second } = await confirmMissing(h, file);
			expect(second).toBe('unknown');
			expect(Number(await h.redis.get(hourKey))).toBe(0);
			expect(h.announcementService.create).not.toHaveBeenCalled();
		});

		test('a failing notification does not undo or fail the repair', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.announcementService.create.mockRejectedValueOnce(new Error('announcement failed'));
			const { second } = await confirmMissing(h, file);
			expect(second).toBe('repaired');
			expect(h.driveService.deleteFileWithMissingObject).toHaveBeenCalledTimes(1);
		});

		test('one owner is notified at most once per day', async () => {
			const h = setup();
			const a = h.add(1, { userId: 'same-user' });
			const b = h.add(2, { userId: 'same-user' });
			h.add(3);
			await confirmMissing(h, a);
			await confirmMissing(h, b);
			expect(h.driveService.deleteFileWithMissingObject).toHaveBeenCalledTimes(2);
			expect(h.announcementService.create).toHaveBeenCalledTimes(1);

			vi.advanceTimersByTime(25 * 60 * 60 * 1000);
			const c = h.add(4, { userId: 'same-user' });
			await confirmMissing(h, c);
			expect(h.announcementService.create).toHaveBeenCalledTimes(2);
		});

		test('the notice wording never exposes technical details', async () => {
			const h = setup();
			const file = h.add(1, { type: 'video/mp4' });
			h.add(2);
			await confirmMissing(h, file);
			const arg = (h.announcementService.create.mock.calls[0] as unknown as [{ title: string; text: string }])[0];
			expect(arg.text).toBe('因相关审查原因，您网盘中的部分文件已被删除。');
			expect(`${arg.title}${arg.text}`).not.toMatch(/OSS|对象存储|404|丢失|bucket/i);
		});
	});

	describe('circuit breaker', () => {
		test('many different files looking missing at once is treated as a bucket problem and nothing is deleted', async () => {
			const h = setup();
			h.add(100); // 金丝雀
			const files = [1, 2, 3, 4, 5, 6].map(n => h.add(n));
			for (const f of files) h.objects.set(f.accessKey, 'missing');

			const results: string[] = [];
			for (const f of files) {
				results.push(await h.service.checkFile(f as never));
				vi.advanceTimersByTime(1000);
			}
			expect(results.slice(0, 4)).toEqual(['suspected', 'suspected', 'suspected', 'suspected']);
			expect(results.slice(4)).toEqual(['skipped', 'skipped']);

			// 即使之前已处于待确认状态，熔断期间也不会删除
			vi.advanceTimersByTime(MISSING_CONFIRM_DELAY_MS + 1000);
			for (const f of files) expect(await h.service.checkFile(f as never)).toBe('skipped');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
			expect(h.logger.error).toHaveBeenCalled();
		});

		test('automatic repair resumes after the pause', async () => {
			const h = setup();
			h.add(100);
			const files = [1, 2, 3, 4, 5].map(n => h.add(n));
			for (const f of files) h.objects.set(f.accessKey, 'missing');
			for (const f of files) await h.service.checkFile(f as never);

			vi.advanceTimersByTime(61 * 60 * 1000);
			const late = h.add(9);
			const { second } = await confirmMissing(h, late);
			expect(second).toBe('repaired');
		});

		test('the hourly limit blocks repairs once the quota is used up', async () => {
			const h = setup();
			h.add(1000);
			// 节奏熔断（10 分钟内多个文件）与小时限额是两道独立的闸，这里把额度直接推到上限只测后者
			const hourKey = `drive:missing:hourly:${Math.floor(Date.now() / 3_600_000)}`;
			for (let i = 0; i < REPAIR_HOURLY_LIMIT; i++) await h.redis.incr(hourKey);

			const f = h.add(1, { userId: 'owner1' });
			const { second } = await confirmMissing(h, f);
			expect(second).toBe('skipped');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
			expect(h.logger.error).toHaveBeenCalledWith(expect.stringContaining('hourly automatic repair limit'));
		});

		test('a calm pace below both limits repairs every file', async () => {
			const h = setup();
			h.add(1000);
			const outcomes: string[] = [];
			for (let i = 1; i <= 8; i++) {
				const f = h.add(i, { userId: `owner${i}` });
				const { second } = await confirmMissing(h, f);
				outcomes.push(second);
				// 每个文件间隔数分钟，10 分钟窗口内不会累积到整桶熔断阈值
				vi.advanceTimersByTime(8 * 60 * 1000);
			}
			expect(outcomes.every(o => o === 'repaired')).toBe(true);
			expect(h.driveService.deleteFileWithMissingObject).toHaveBeenCalledTimes(8);
		});
	});

	describe('checkByReportedUrl', () => {
		test('ignores urls that are not object storage links of a known file', async () => {
			const h = setup();
			h.add(1);
			expect(await h.service.checkByReportedUrl('https://site.example.com/files/abc')).toBe('ignored');
			expect(await h.service.checkByReportedUrl('javascript:alert(1)')).toBe('ignored');
			expect(await h.service.checkByReportedUrl('http://elsewhere.example.top/x/y.webp')).toBe('ignored');
			expect(await h.service.checkByReportedUrl(`${BASE}/misskey/no-such-file.webp`)).toBe('ignored');
			expect(h.head).not.toHaveBeenCalled();
		});

		test('a missing thumbnail alone never deletes the file: only the original is probed', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			// 缩略图 404，但原图存在
			const result = await h.service.checkByReportedUrl(file.thumbnailUrl);
			expect(result).toBe('present');
			expect(h.head).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ Key: file.accessKey }));
			expect(h.head).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ Key: 'misskey/thumbnail-obj1.webp' }));
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test('a lookup failure never escapes as an unhandled rejection', async () => {
			const h = setup();
			h.add(1);
			h.repo.createQueryBuilder.mockImplementation(() => { throw new Error('db down'); });
			await expect(h.service.checkByReportedUrl(`${BASE}/misskey/obj1.webp`)).resolves.toBe('unknown');
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test('unwraps proxy urls and runs the full check', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			const proxied = `https://site.example.com/proxy/avatar.webp?url=${encodeURIComponent(file.url)}&avatar=1`;
			expect(await h.service.checkByReportedUrl(proxied)).toBe('suspected');
		});
	});
});

describe('DriveService.deleteFileWithMissingObject', () => {
	function makeDriveService() {
		const svc = Object.create(DriveService.prototype) as Record<string, unknown> & InstanceType<typeof DriveService>;
		/** 已提交的墓碑；事务回滚时丢弃暂存 */
		const inserted: unknown[] = [];
		let staged: unknown[] = [];
		const row = { current: null as ReturnType<typeof makeFile> | null };
		const insertBuilder = {
			insert: vi.fn(() => insertBuilder),
			values: vi.fn((v: unknown) => { staged.push(v); return insertBuilder; }),
			orIgnore: vi.fn(() => insertBuilder),
			execute: vi.fn(async () => ({})),
		};
		/** 事务内外共用的 delete 桩：行删除与墓碑写入一起提交或一起回滚 */
		const deleteFn = vi.fn(async (_where: unknown) => ({ affected: 1 }));
		const manager = {
			getRepository: (entity: { name: string }) => entity.name === 'MiDriveFile'
				? { delete: deleteFn }
				: { createQueryBuilder: () => insertBuilder },
			transaction: undefined as unknown,
		};
		const transaction = vi.fn(async (cb: (m: typeof manager) => Promise<boolean>) => {
			staged = [];
			try {
				const result = await cb(manager);
				inserted.push(...staged);
				return result;
			} finally {
				staged = [];
			}
		});
		const driveFilesRepository = {
			findOneBy: vi.fn(async () => row.current),
			manager: { transaction },
			delete: deleteFn,
		};
		const usersRepository = { update: vi.fn(async () => ({})) };
		const driveChart = { update: vi.fn() };
		const perUserDriveChart = { update: vi.fn() };
		const globalEventService = { publishDriveStream: vi.fn(), publishInternalEvent: vi.fn() };
		Object.assign(svc, {
			driveFilesRepository,
			usersRepository,
			driveChart,
			perUserDriveChart,
			globalEventService,
		});
		return { svc, row, inserted, insertBuilder, transaction, driveFilesRepository, usersRepository, driveChart, perUserDriveChart, globalEventService };
	}

	const baseFile = () => ({ ...makeFile(1), name: 'a.webp', size: 10, properties: { width: 100, height: 50 } });

	test('writes a tombstone, deletes by id and access key, and clears avatar/banner caches', async () => {
		const t = makeDriveService();
		const file = baseFile();
		t.row.current = file as never;
		expect(await t.svc.deleteFileWithMissingObject(file as never)).toBe(true);

		expect(t.inserted[0]).toMatchObject({ id: 'file1', userId: 'user1', name: 'a.webp', type: 'image/webp', size: 10, properties: { width: 100, height: 50 } });
		expect(t.driveFilesRepository.delete).toHaveBeenCalledWith({ id: 'file1', accessKey: file.accessKey });
		expect(t.usersRepository.update).toHaveBeenCalledTimes(2);
		expect(t.globalEventService.publishDriveStream).toHaveBeenCalledWith('user1', 'fileDeleted', 'file1');
		expect(t.globalEventService.publishInternalEvent).toHaveBeenCalledWith('localUserUpdated', { id: 'user1' });
		expect(t.driveChart.update).toHaveBeenCalled();
	});

	test.each([
		['internally stored', { storedInternal: true }],
		['a remote link', { isLink: true }],
		['a remote user file', { userHost: 'remote.example' }],
		['missing an access key', { accessKey: null }],
	])('refuses %s without touching the database', async (_n, overrides) => {
		const t = makeDriveService();
		const file = { ...baseFile(), ...overrides };
		t.row.current = file as never;
		expect(await t.svc.deleteFileWithMissingObject(file as never)).toBe(false);
		expect(t.driveFilesRepository.findOneBy).not.toHaveBeenCalled();
		expect(t.driveFilesRepository.delete).not.toHaveBeenCalled();
	});

	test('refuses when the row is gone', async () => {
		const t = makeDriveService();
		t.row.current = null;
		expect(await t.svc.deleteFileWithMissingObject(baseFile() as never)).toBe(false);
		expect(t.driveFilesRepository.delete).not.toHaveBeenCalled();
	});

	test.each([
		['the access key was replaced', { accessKey: 'misskey/replaced.webp' }],
		['the url was replaced', { url: `${BASE}/misskey/replaced.webp` }],
		['it became an internal file', { storedInternal: true }],
		['it became a link', { isLink: true }],
	])('refuses when the stored row changed since the check (%s)', async (_n, change) => {
		const t = makeDriveService();
		const checked = baseFile();
		t.row.current = { ...checked, ...change } as never;
		expect(await t.svc.deleteFileWithMissingObject(checked as never)).toBe(false);
		expect(t.driveFilesRepository.delete).not.toHaveBeenCalled();
		expect(t.inserted).toHaveLength(0);
	});

	test('reports false and skips side effects when the guarded delete removes nothing', async () => {
		const t = makeDriveService();
		const file = baseFile();
		t.row.current = file as never;
		t.driveFilesRepository.delete.mockResolvedValueOnce({ affected: 0 });
		expect(await t.svc.deleteFileWithMissingObject(file as never)).toBe(false);
		expect(t.globalEventService.publishDriveStream).not.toHaveBeenCalled();
		expect(t.usersRepository.update).not.toHaveBeenCalled();
		expect(t.inserted).toHaveLength(0);
	});

	test('rolls back as a whole: a failing tombstone write leaves no tombstone and no side effects', async () => {
		const t = makeDriveService();
		const file = baseFile();
		t.row.current = file as never;
		t.insertBuilder.execute.mockRejectedValueOnce(new Error('tombstone insert failed'));
		await expect(t.svc.deleteFileWithMissingObject(file as never)).rejects.toThrow('tombstone insert failed');
		expect(t.inserted).toHaveLength(0);
		expect(t.globalEventService.publishDriveStream).not.toHaveBeenCalled();
		expect(t.usersRepository.update).not.toHaveBeenCalled();
		expect(t.driveChart.update).not.toHaveBeenCalled();
	});

	test('runs delete and tombstone inside one transaction', async () => {
		const t = makeDriveService();
		const file = baseFile();
		t.row.current = file as never;
		await t.svc.deleteFileWithMissingObject(file as never);
		expect(t.transaction).toHaveBeenCalledTimes(1);
		expect(t.inserted).toHaveLength(1);
	});
});
