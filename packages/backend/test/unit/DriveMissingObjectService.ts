/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { DriveMissingObjectService, MISSING_BATCH_MAX, REPORT_PROBE_BUDGET_PER_MINUTE } from '@/core/DriveMissingObjectService.js';
import { DriveService } from '@/core/DriveService.js';

//#region fakes
class FakeRedis {
	private store = new Map<string, { v: string; exp: number | null }>();

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
	async incr(key: string) {
		const cur = Number(this.live(key)?.v ?? 0) + 1;
		const e = this.store.get(key);
		this.store.set(key, { v: String(cur), exp: e?.exp ?? null });
		return cur;
	}
	async expire(key: string, seconds: number) {
		const e = this.live(key);
		if (e) e.exp = Date.now() + seconds * 1000;
		return e ? 1 : 0;
	}
}

const BASE = 'http://oss.example.top/bucket-a';

type FileRow = ReturnType<typeof makeFile>;
type ReportRow = {
	id: string; fileId: string; bucket: string; objectKey: string; scope: string;
	reportCount: number; firstReportedAt: Date; lastReportedAt: Date; verifiedAt: Date;
};

function makeFile(n: number, overrides: Record<string, unknown> = {}) {
	return {
		id: `file${n}`,
		userId: `user${n}`,
		userHost: null,
		storedInternal: false,
		isLink: false,
		type: 'image/webp',
		name: `name${n}.webp`,
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

function denied() {
	return Object.assign(new Error('denied'), { name: 'Unknown', $metadata: { httpStatusCode: 403 } });
}

type Harness = ReturnType<typeof setup>;

function setup(opts: { useObjectStorage?: boolean } = {}) {
	const redis = new FakeRedis();
	/** key -> 对象状态；不在表里的 key 视为存在（用作金丝雀） */
	const objects = new Map<string, 'present' | 'missing' | Error>();
	const head = vi.fn(async (_meta: unknown, input: { Bucket: string; Key: string }) => {
		const state = objects.get(input.Key) ?? 'present';
		if (state === 'present') return {};
		if (state === 'missing') throw notFound();
		throw state;
	});

	const files = new Map<string, FileRow>();
	const driveFilesRepository = {
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

	const reports = new Map<string, ReportRow>();
	let nextReportId = 1;
	const reportsRepository = {
		findBy: vi.fn(async (where: { id: string }[]) => where.map(w => reports.get(w.id)).filter((r): r is ReportRow => r != null)),
		delete: vi.fn(async (where: { id?: string; fileId?: string }) => {
			let affected = 0;
			for (const [id, r] of [...reports]) {
				if ((where.id != null && r.id === where.id) || (where.fileId != null && r.fileId === where.fileId)) {
					reports.delete(id);
					affected++;
				}
			}
			return { affected };
		}),
		update: vi.fn(async (where: { id: string }, patch: Partial<ReportRow>) => {
			const r = reports.get(where.id);
			if (r) Object.assign(r, patch);
			return { affected: r ? 1 : 0 };
		}),
		createQueryBuilder: vi.fn(() => {
			let mode: 'update' | 'insert' = 'update';
			let patch: Record<string, unknown> = {};
			let target: string | null = null;
			const qb: Record<string, unknown> = {};
			qb.update = vi.fn(() => { mode = 'update'; return qb; });
			qb.insert = vi.fn(() => { mode = 'insert'; return qb; });
			qb.set = vi.fn((p: Record<string, unknown>) => { patch = p; return qb; });
			qb.values = vi.fn((p: Record<string, unknown>) => { patch = p; return qb; });
			qb.orIgnore = vi.fn(() => qb);
			qb.where = vi.fn((_sql: string, p: { fileId: string }) => { target = p.fileId; return qb; });
			qb.execute = vi.fn(async () => {
				if (mode === 'update') {
					const r = [...reports.values()].find(x => x.fileId === target);
					if (!r) return { affected: 0 };
					const { reportCount, ...rest } = patch;
					Object.assign(r, rest);
					r.reportCount = typeof reportCount === 'function' ? r.reportCount + 1 : r.reportCount;
					return { affected: 1 };
				}
				const row = patch as unknown as ReportRow;
				// 唯一索引 + ON CONFLICT DO NOTHING
				if ([...reports.values()].some(x => x.fileId === row.fileId)) return { affected: 0 };
				reports.set(row.id, { ...row });
				return { affected: 1 };
			});
			return qb;
		}),
	};

	const driveService = {
		deleteFileWithMissingObject: vi.fn(async (file: { id: string }, _deleter?: unknown) => {
			files.delete(file.id);
			for (const [id, r] of [...reports]) if (r.fileId === file.id) reports.delete(id);
			return true;
		}),
	};
	const notificationService = { createNotification: vi.fn() };
	const idService = { gen: vi.fn(() => `report${nextReportId++}`) };
	const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), succ: vi.fn() };
	const loggerService = { getLogger: () => logger };
	const config = { url: 'https://site.example.com' };
	const meta = {
		useObjectStorage: opts.useObjectStorage ?? true,
		iconUrl: 'https://site.example.com/icon.png',
		objectStorageBaseUrl: BASE,
		objectStorageBucket: 'bucket-a',
		objectStorageEndpoint: 'oss.example.top',
		objectStoragePort: null,
		objectStorageUseSSL: false,
		objectStorageS3ForcePathStyle: true,
	};

	const service = new DriveMissingObjectService(
		config as never, meta as never, driveFilesRepository as never, reportsRepository as never, redis as never,
		{ head } as never, driveService as never, notificationService as never, idService as never, loggerService as never,
	);

	const add = (n: number, overrides: Record<string, unknown> = {}) => {
		const f = makeFile(n, overrides);
		files.set(f.id, f);
		return f;
	};
	/** 直接放入一条待审记录，模拟此前已被上报核实 */
	const addReport = (file: FileRow, overrides: Partial<ReportRow> = {}) => {
		const id = `rep-${file.id}`;
		const r: ReportRow = {
			id, fileId: file.id, bucket: 'bucket-a', objectKey: file.accessKey, scope: 'current',
			reportCount: 1, firstReportedAt: new Date(), lastReportedAt: new Date(), verifiedAt: new Date(), ...overrides,
		};
		reports.set(id, r);
		return r;
	};
	return { service, redis, objects, head, files, reports, driveFilesRepository, reportsRepository, driveService, notificationService, logger, meta, add, addReport };
}

const moderator = { id: 'mod1' } as never;
//#endregion

describe('DriveMissingObjectService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-11-08T10:00:00.000Z'));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	describe('reportByUrl: what gets recorded', () => {
		test('records a verified-missing file with one report row', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2); // 当前桶里的金丝雀
			h.objects.set(file.accessKey, 'missing');

			expect(await h.service.reportByUrl(file.url)).toBe('recorded');
			expect(h.reports.size).toBe(1);
			expect(h.reports.get('report1')).toMatchObject({ fileId: file.id, bucket: 'bucket-a', objectKey: file.accessKey, scope: 'current', reportCount: 1 });
			// 上报本身绝不删除任何数据
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
			expect(h.files.has(file.id)).toBe(true);
		});

		test('a repeated report bumps the counter instead of adding a row', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			await h.service.reportByUrl(file.url);
			vi.advanceTimersByTime(60_000);
			await h.service.reportByUrl(file.url);
			vi.advanceTimersByTime(60_000);
			await h.service.reportByUrl(file.url);
			expect(h.reports.size).toBe(1);
			expect([...h.reports.values()][0].reportCount).toBe(3);
		});

		test('a thumbnail url is resolved to its owner file and only the original is probed', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			expect(await h.service.reportByUrl(file.thumbnailUrl)).toBe('recorded');
			expect(h.head).toHaveBeenCalledWith(expect.anything(), { Bucket: 'bucket-a', Key: file.accessKey });
			expect(h.head).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ Key: 'misskey/thumbnail-obj1.webp' }));
		});

		test('an existing object is never recorded', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			expect(await h.service.reportByUrl(file.url)).toBe('present');
			expect(h.reports.size).toBe(0);
		});

		test('a missing thumbnail alone never records the file', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set('misskey/thumbnail-obj1.webp', 'missing'); // 原图仍在
			expect(await h.service.reportByUrl(file.thumbnailUrl)).toBe('present');
			expect(h.reports.size).toBe(0);
		});

		test('an object that came back removes its stale report', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.addReport(file);
			expect(await h.service.reportByUrl(file.url)).toBe('cleared');
			expect(h.reports.size).toBe(0);
		});

		test('records files left in a previous bucket with legacy scope, probing that bucket', async () => {
			const h = setup();
			const file = h.add(1, { url: 'http://oss.example.top/old-bucket/misskey/obj1.webp' });
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			expect(await h.service.reportByUrl(file.url)).toBe('recorded');
			expect(h.head).toHaveBeenCalledWith(expect.anything(), { Bucket: 'old-bucket', Key: file.accessKey });
			expect([...h.reports.values()][0]).toMatchObject({ bucket: 'old-bucket', scope: 'legacy' });
		});
	});

	describe('reportByUrl: what is never recorded', () => {
		test.each([
			['access denied', denied()],
			['server error', Object.assign(new Error('boom'), { name: 'Unknown', $metadata: { httpStatusCode: 500 } })],
			['throttling', Object.assign(new Error('slow'), { name: 'SlowDown', $metadata: { httpStatusCode: 429 } })],
			['timeout', Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
			['network reset', Object.assign(new Error('reset'), { code: 'ECONNRESET' })],
			['no such bucket', Object.assign(new Error('bucket'), { name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } })],
		])('%s is unknown and records nothing', async (_name, err) => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, err);
			expect(await h.service.reportByUrl(file.url)).toBe('unknown');
			expect(h.reports.size).toBe(0);
		});

		test('object storage disabled', async () => {
			const h = setup({ useObjectStorage: false });
			const file = h.add(1);
			expect(await h.service.reportByUrl(file.url)).toBe('ignored');
			expect(h.head).not.toHaveBeenCalled();
		});

		test.each([
			['internally stored', { storedInternal: true }],
			['a remote link', { isLink: true }],
			['owned by a remote user', { userHost: 'remote.example' }],
			['without an access key', { accessKey: null }],
			['with an access key that disagrees with the url', { accessKey: 'misskey/other.webp' }],
			['on another host', { url: 'http://elsewhere.example.top/bucket-a/misskey/obj1.webp' }],
		])('a file %s is ignored without any request', async (_name, overrides) => {
			const h = setup();
			const file = h.add(1, overrides);
			// 即使上报的 URL 能精确命中该行
			expect(await h.service.reportByUrl(file.url)).toBe('ignored');
			expect(h.head).not.toHaveBeenCalled();
			expect(h.reports.size).toBe(0);
		});

		test('legacy buckets are not guessed without path-style addressing', async () => {
			const h = setup();
			Object.assign(h.meta, { objectStorageS3ForcePathStyle: false });
			const file = h.add(1, { url: 'http://oss.example.top/old-bucket/misskey/obj1.webp' });
			expect(await h.service.reportByUrl(file.url)).toBe('ignored');
			expect(h.head).not.toHaveBeenCalled();
		});

		test('a failing health canary blocks recording', async () => {
			const h = setup();
			const file = h.add(1);
			const other = h.add(2);
			h.objects.set(file.accessKey, 'missing');
			h.objects.set(other.accessKey, denied());
			expect(await h.service.reportByUrl(file.url)).toBe('unknown');
			expect(h.reports.size).toBe(0);
		});

		test('no object to compare against means no recording', async () => {
			const h = setup();
			const file = h.add(1);
			h.objects.set(file.accessKey, 'missing');
			expect(await h.service.reportByUrl(file.url)).toBe('unknown');
			expect(h.reports.size).toBe(0);
		});

		test('a legacy-bucket canary cannot vouch for the endpoint', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2, { url: 'http://oss.example.top/old-bucket/misskey/obj2.webp' });
			h.objects.set(file.accessKey, 'missing');
			expect(await h.service.reportByUrl(file.url)).toBe('unknown');
			expect(h.reports.size).toBe(0);
		});

		test.each([
			['the site itself', 'https://site.example.com/files/abc'],
			['a script url', 'javascript:alert(1)'],
			['an unrelated host', 'http://evil.example.org/bucket-a/misskey/obj1.webp'],
			['an unknown file', `${BASE}/misskey/no-such-file.webp`],
			['garbage', 'not a url'],
		])('%s is ignored', async (_name, url) => {
			const h = setup();
			h.add(1);
			expect(await h.service.reportByUrl(url)).toBe('ignored');
			expect(h.head).not.toHaveBeenCalled();
		});

		test('a lookup failure never escapes as an unhandled rejection', async () => {
			const h = setup();
			h.add(1);
			h.driveFilesRepository.createQueryBuilder.mockImplementation(() => { throw new Error('db down'); });
			await expect(h.service.reportByUrl(`${BASE}/misskey/obj1.webp`)).resolves.toBe('unknown');
			expect(h.reports.size).toBe(0);
		});

		test('unwraps proxy urls', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			const proxied = `https://site.example.com/proxy/avatar.webp?url=${encodeURIComponent(file.url)}&avatar=1`;
			expect(await h.service.reportByUrl(proxied)).toBe('recorded');
		});
	});

	describe('reportByUrl: abuse limits', () => {
		test('the same file is probed at most once per cooldown', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			expect(await h.service.reportByUrl(file.url)).toBe('recorded');
			const calls = h.head.mock.calls.length;
			vi.advanceTimersByTime(5_000);
			expect(await h.service.reportByUrl(file.url)).toBe('skipped');
			expect(h.head.mock.calls.length).toBe(calls);
			vi.advanceTimersByTime(30_000);
			expect(await h.service.reportByUrl(file.url)).toBe('recorded');
		});

		test('concurrent reports of one file probe once', async () => {
			const h = setup();
			const file = h.add(1);
			h.add(2);
			h.objects.set(file.accessKey, 'missing');
			const results = await Promise.all([1, 2, 3].map(() => h.service.reportByUrl(file.url)));
			expect(results.filter(r => r === 'recorded')).toHaveLength(1);
			expect(results.filter(r => r === 'skipped')).toHaveLength(2);
			expect(h.reports.size).toBe(1);
		});

		test('a site-wide per-minute budget stops enumeration', async () => {
			const h = setup();
			h.add(1000);
			for (let i = 1; i <= REPORT_PROBE_BUDGET_PER_MINUTE; i++) h.add(i);
			let probed = 0;
			for (let i = 1; i <= REPORT_PROBE_BUDGET_PER_MINUTE + 5; i++) {
				const url = i <= REPORT_PROBE_BUDGET_PER_MINUTE ? `${BASE}/misskey/obj${i}.webp` : `${BASE}/misskey/obj1.webp`;
				const r = await h.service.reportByUrl(url);
				if (r === 'present') probed++;
			}
			expect(probed).toBe(REPORT_PROBE_BUDGET_PER_MINUTE);
			// 下一分钟预算恢复
			vi.advanceTimersByTime(61_000);
			expect(await h.service.reportByUrl(`${BASE}/misskey/obj2.webp`)).toBe('present');
		});
	});

	describe('recheck', () => {
		test('removes restored files, keeps still-missing ones and leaves uncertain ones alone', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1);
			const b = h.add(2);
			const c = h.add(3);
			const ra = h.addReport(a);
			const rb = h.addReport(b);
			const rc = h.addReport(c);
			h.objects.set(b.accessKey, 'missing');
			h.objects.set(c.accessKey, denied());

			const res = await h.service.recheck([ra.id, rb.id, rc.id]);
			expect(res.aborted).toBe(false);
			expect(res.items).toEqual([
				{ id: ra.id, result: 'present' },
				{ id: rb.id, result: 'missing' },
				{ id: rc.id, result: 'unknown' },
			]);
			expect(h.reports.has(ra.id)).toBe(false);
			expect(h.reports.has(rb.id)).toBe(true);
			expect(h.reports.has(rc.id)).toBe(true);
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test('an unknown id is reported as gone', async () => {
			const h = setup();
			h.add(100);
			expect(await h.service.recheck(['nope'])).toEqual({ aborted: false, items: [{ id: 'nope', result: 'gone' }] });
		});

		test('the health canary excludes the batch itself, so an all-missing batch can still be deleted', async () => {
			const h = setup();
			// 一个健康但排得更早的文件（不会被优先选作对照）
			h.add(1);
			// 一批待删文件全部缺失，且排在最新，若被当作对照会把「整批缺失」误判成「存储不健康」
			const targets = [2, 3, 4].map(n => h.add(n));
			for (const f of targets) h.objects.set(f.accessKey, 'missing');
			const ids = targets.map(f => h.addReport(f).id);

			const res = await h.service.deleteReported(ids, moderator);
			expect(res.aborted).toBe(false);
			expect(res.items.every(i => i.result === 'deleted')).toBe(true);
			expect(h.driveService.deleteFileWithMissingObject).toHaveBeenCalledTimes(3);
		});

		test('when the only comparable objects are the batch itself, the batch aborts instead of self-verifying', async () => {
			const h = setup();
			// 库里只有这一个文件且它缺失：没有任何独立对照能证明端点健康，不能靠它自证就删
			const a = h.add(1);
			h.objects.set(a.accessKey, 'missing');
			const ra = h.addReport(a);
			const res = await h.service.deleteReported([ra.id], moderator);
			expect(res.aborted).toBe(true);
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
			expect(h.files.has(a.id)).toBe(true);
		});

		test('an unhealthy storage aborts the whole batch without touching anything', async () => {
			const h = setup();
			const canary = h.add(100);
			const a = h.add(1);
			const ra = h.addReport(a);
			h.objects.set(canary.accessKey, denied());
			// 被测文件也缺失：否则它自己会充当健康金丝雀，证明端点可用，就无法触发整批中止
			h.objects.set(a.accessKey, 'missing');
			const res = await h.service.recheck([ra.id]);
			expect(res.aborted).toBe(true);
			expect(res.items).toEqual([{ id: ra.id, result: 'unknown' }]);
			expect(h.reports.has(ra.id)).toBe(true);
		});
	});

	describe('deleteReported', () => {
		test('deletes only files whose object is confirmed missing, with the moderator recorded', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1);
			const ra = h.addReport(a);
			h.objects.set(a.accessKey, 'missing');

			const res = await h.service.deleteReported([ra.id], moderator);
			expect(res).toEqual({ aborted: false, items: [{ id: ra.id, result: 'deleted' }] });
			expect(h.driveService.deleteFileWithMissingObject).toHaveBeenCalledWith(expect.objectContaining({ id: a.id }), moderator);
		});

		test('an object that came back is not deleted and its report is dropped', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1);
			const ra = h.addReport(a);
			const res = await h.service.deleteReported([ra.id], moderator);
			expect(res.items).toEqual([{ id: ra.id, result: 'present' }]);
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
			expect(h.files.has(a.id)).toBe(true);
			expect(h.reports.has(ra.id)).toBe(false);
			expect(h.notificationService.createNotification).not.toHaveBeenCalled();
		});

		test.each([
			['access denied', denied()],
			['server error', Object.assign(new Error('boom'), { name: 'Unknown', $metadata: { httpStatusCode: 500 } })],
			['timeout', Object.assign(new Error('timeout'), { name: 'TimeoutError' })],
		])('%s on a single file leaves it untouched', async (_name, err) => {
			const h = setup();
			h.add(100);
			const a = h.add(1);
			const ra = h.addReport(a);
			h.objects.set(a.accessKey, err);
			const res = await h.service.deleteReported([ra.id], moderator);
			expect(res.items).toEqual([{ id: ra.id, result: 'unknown' }]);
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
			expect(h.reports.has(ra.id)).toBe(true);
		});

		test('an unhealthy storage aborts the batch: nothing deleted, nobody notified', async () => {
			const h = setup();
			const canary = h.add(100);
			const a = h.add(1);
			const ra = h.addReport(a);
			h.objects.set(a.accessKey, 'missing');
			h.objects.set(canary.accessKey, denied());
			const res = await h.service.deleteReported([ra.id], moderator);
			expect(res.aborted).toBe(true);
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
			expect(h.notificationService.createNotification).not.toHaveBeenCalled();
			expect(h.files.has(a.id)).toBe(true);
		});

		test('a changed configuration that no longer resolves the location skips the file', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1, { url: 'http://oss.example.top/old-bucket/misskey/obj1.webp' });
			const ra = h.addReport(a, { scope: 'legacy', bucket: 'old-bucket' });
			h.objects.set(a.accessKey, 'missing');
			Object.assign(h.meta, { objectStorageS3ForcePathStyle: false }); // 配置变了
			const res = await h.service.deleteReported([ra.id], moderator);
			expect(res.items).toEqual([{ id: ra.id, result: 'unknown' }]);
			expect(h.driveService.deleteFileWithMissingObject).not.toHaveBeenCalled();
		});

		test('a file that changed since reporting is not deleted', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1);
			const ra = h.addReport(a);
			h.objects.set(a.accessKey, 'missing');
			h.driveService.deleteFileWithMissingObject.mockResolvedValueOnce(false);
			const res = await h.service.deleteReported([ra.id], moderator);
			expect(res.items).toEqual([{ id: ra.id, result: 'unknown' }]);
			expect(h.notificationService.createNotification).not.toHaveBeenCalled();
		});

		test('a report whose file vanished is cleaned up and reported as gone', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1);
			const ra = h.addReport(a);
			h.files.delete(a.id);
			const res = await h.service.deleteReported([ra.id], moderator);
			expect(res.items).toEqual([{ id: ra.id, result: 'gone' }]);
			expect(h.reports.has(ra.id)).toBe(false);
		});

		test('one failing file does not stop the others', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1);
			const b = h.add(2);
			const ra = h.addReport(a);
			const rb = h.addReport(b);
			h.objects.set(a.accessKey, 'missing');
			h.objects.set(b.accessKey, 'missing');
			h.driveService.deleteFileWithMissingObject.mockRejectedValueOnce(new Error('db hiccup'));
			const res = await h.service.deleteReported([ra.id, rb.id], moderator);
			expect(res.items).toEqual([{ id: ra.id, result: 'unknown' }, { id: rb.id, result: 'deleted' }]);
		});

		test('duplicate ids are processed once and the batch size is capped', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1);
			const ra = h.addReport(a);
			h.objects.set(a.accessKey, 'missing');
			const res = await h.service.deleteReported([ra.id, ra.id, ra.id], moderator);
			expect(res.items).toHaveLength(1);

			const many = Array.from({ length: MISSING_BATCH_MAX + 20 }, (_, i) => `x${i}`);
			const capped = await h.service.deleteReported(many, moderator);
			expect(capped.items).toHaveLength(MISSING_BATCH_MAX);
		});

		test('an empty request does nothing', async () => {
			const h = setup();
			expect(await h.service.deleteReported([], moderator)).toEqual({ aborted: false, items: [] });
			expect(h.head).not.toHaveBeenCalled();
		});
	});

	describe('owner notification (Misskey built-in notification)', () => {
		test('each owner gets exactly one app notification per batch, with the fixed wording', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1, { userId: 'same-user' });
			const b = h.add(2, { userId: 'same-user' });
			const c = h.add(3, { userId: 'other-user' });
			const ids = [a, b, c].map(f => h.addReport(f).id);
			for (const f of [a, b, c]) h.objects.set(f.accessKey, 'missing');

			await h.service.deleteReported(ids, moderator);
			expect(h.notificationService.createNotification).toHaveBeenCalledTimes(2);
			expect(h.notificationService.createNotification).toHaveBeenCalledWith('same-user', 'app', {
				appAccessTokenId: null,
				customHeader: '网盘内容已被清理',
				customBody: '因相关审查原因，您网盘中的部分图片已被删除。',
				customIcon: 'https://site.example.com/icon.png',
			});
			expect(h.notificationService.createNotification).toHaveBeenCalledWith('other-user', 'app', expect.anything());
		});

		test('the wording says files when any deleted file is not an image', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1, { userId: 'u' });
			const b = h.add(2, { userId: 'u', type: 'video/mp4' });
			const ids = [a, b].map(f => h.addReport(f).id);
			for (const f of [a, b]) h.objects.set(f.accessKey, 'missing');
			await h.service.deleteReported(ids, moderator);
			expect(h.notificationService.createNotification).toHaveBeenCalledWith('u', 'app', expect.objectContaining({
				customBody: '因相关审查原因，您网盘中的部分文件已被删除。',
			}));
		});

		test('the wording never exposes technical details', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1);
			const ra = h.addReport(a);
			h.objects.set(a.accessKey, 'missing');
			await h.service.deleteReported([ra.id], moderator);
			const body = (h.notificationService.createNotification.mock.calls[0] as unknown as [string, string, { customBody: string; customHeader: string }])[2];
			expect(`${body.customHeader}${body.customBody}`).not.toMatch(/OSS|对象存储|404|丢失|bucket/i);
		});

		test('a failing notification does not undo or fail the deletion', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1);
			const ra = h.addReport(a);
			h.objects.set(a.accessKey, 'missing');
			h.notificationService.createNotification.mockImplementationOnce(() => { throw new Error('notify failed'); });
			const res = await h.service.deleteReported([ra.id], moderator);
			expect(res.items).toEqual([{ id: ra.id, result: 'deleted' }]);
			expect(h.driveService.deleteFileWithMissingObject).toHaveBeenCalledTimes(1);
		});

		test('files that were not deleted notify nobody', async () => {
			const h = setup();
			h.add(100);
			const a = h.add(1);
			const ra = h.addReport(a);
			h.objects.set(a.accessKey, denied());
			await h.service.deleteReported([ra.id], moderator);
			expect(h.notificationService.createNotification).not.toHaveBeenCalled();
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
		const usersRepository = { update: vi.fn(async () => ({})), findOneBy: vi.fn(async () => ({ username: 'owner', host: null })) };
		const driveChart = { update: vi.fn() };
		const perUserDriveChart = { update: vi.fn() };
		const globalEventService = { publishDriveStream: vi.fn(), publishInternalEvent: vi.fn() };
		const moderationLogService = { logSafely: vi.fn(async () => {}) };
		Object.assign(svc, {
			moderationLogService,
			driveFilesRepository,
			usersRepository,
			driveChart,
			perUserDriveChart,
			globalEventService,
		});
		return { svc, row, inserted, insertBuilder, transaction, driveFilesRepository, usersRepository, driveChart, perUserDriveChart, globalEventService, moderationLogService };
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
	test('writes an audit log entry when a moderator deletes the file', async () => {
		const t = makeDriveService();
		const file = baseFile();
		t.row.current = file as never;
		await t.svc.deleteFileWithMissingObject(file as never, { id: 'mod1' } as never);
		expect(t.moderationLogService.logSafely).toHaveBeenCalledWith({ id: 'mod1' }, 'deleteDriveFile', { fileId: 'file1', fileUserId: 'user1', fileUserUsername: 'owner', fileUserHost: null });
	});

	test('writes no audit entry without a moderator, and none when nothing was deleted', async () => {
		const t = makeDriveService();
		const file = baseFile();
		t.row.current = file as never;
		await t.svc.deleteFileWithMissingObject(file as never);
		expect(t.moderationLogService.logSafely).not.toHaveBeenCalled();

		const t2 = makeDriveService();
		t2.row.current = null;
		await t2.svc.deleteFileWithMissingObject(file as never, { id: 'mod1' } as never);
		expect(t2.moderationLogService.logSafely).not.toHaveBeenCalled();
	});
});
