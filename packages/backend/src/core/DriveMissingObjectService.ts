/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Brackets } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { DriveFilesRepository, DriveMissingObjectReportsRepository, MiMeta, MiUser } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { bindThis } from '@/decorators.js';
import { S3Service } from '@/core/S3Service.js';
import { DriveService } from '@/core/DriveService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { IdService } from '@/core/IdService.js';
import { LoggerService } from '@/core/LoggerService.js';
import {
	buildMissingObjectNotice,
	classifyObjectProbeError,
	extractReportedObjectUrl,
	resolveObjectLocation,
	urlMayBelongToObjectStorage,
	type ObjectLocation,
	type ObjectProbe,
} from '@/misc/drive-missing-object.js';
import type Logger from '@/logger.js';

/** 同一个文件的核查冷却，避免热点图片被大量访问时反复打对象存储。 */
const CHECK_COOLDOWN_SECONDS = 30;
/** 全站每分钟最多触发这么多次由上报引起的 HEAD（金丝雀不计），挡住枚举式滥用。 */
export const REPORT_PROBE_BUDGET_PER_MINUTE = 120;
/** 管理员单次批量操作的上限。 */
export const MISSING_BATCH_MAX = 100;
/**
 * 上报路径的存储健康状态缓存时长。金丝雀一次最多打 10 个 HEAD 且不计入上面的预算，
 * 若不缓存，匿名端点能把 OSS 请求量放大十倍以上。缓存后 60 秒内最多打一轮金丝雀。
 * 批量删除路径不用此缓存（删除必须实时核实）。
 */
const HEALTH_CACHE_SECONDS = 60;

const KEY = {
	cooldown: (fileId: string) => `drive:missing:cooldown:${fileId}`,
	healthy: 'drive:missing:healthy',
	budget: (minute: number) => `drive:missing:budget:${minute}`,
} as const;

/** 上报：只有 recorded / cleared 会改动待审列表。 */
export type MissingReportResult =
	| 'ignored' // 不是对象存储里的本地文件，或无法判定位置
	| 'skipped' // 冷却中或预算用尽
	| 'unknown' // 无法确认（403/5xx/超时/金丝雀失败等），不记录
	| 'present' // 对象存在，未改动列表
	| 'cleared' // 对象存在，已有的待审记录被移除
	| 'recorded'; // 确认缺失，已写入或更新待审记录

export type MissingBatchResult =
	| 'deleted' // 已确认缺失并删除
	| 'present' // 对象已恢复，待审记录已移除
	| 'missing' // 重新核实后仍然缺失（仅 recheck），记录保留
	| 'unknown' // 无法确认，保持不动
	| 'gone'; // 记录或文件已不存在

export type MissingBatchItemResult = { id: string; result: MissingBatchResult };

export type MissingBatchSummary = {
	items: MissingBatchItemResult[];
	/** 对象存储本身不可用（金丝雀失败）时整批中止，所有条目都是 unknown。 */
	aborted: boolean;
};

@Injectable()
export class DriveMissingObjectService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.driveMissingObjectReportsRepository)
		private reportsRepository: DriveMissingObjectReportsRepository,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private s3Service: S3Service,
		private driveService: DriveService,
		private notificationService: NotificationService,
		private idService: IdService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('drive-missing-object');
	}

	//#region 上报（匿名入口调用）
	/** 通过上报的 URL 找到本地文件并核查。永不抛出；URL 对应不到任何文件时静默忽略。 */
	@bindThis
	public async reportByUrl(rawUrl: string): Promise<MissingReportResult> {
		try {
			const url = extractReportedObjectUrl(rawUrl, this.config.url);
			if (url == null) return 'ignored';
			// 粗筛：主机不属于对象存储的外链不查库
			if (!this.meta.useObjectStorage || !urlMayBelongToObjectStorage(url, this.meta)) return 'ignored';

			// 缩略图/webpublic 上报同样能定位到所属文件
			const file = await this.driveFilesRepository.createQueryBuilder('file')
				.where('file.userHost IS NULL')
				.andWhere('file.storedInternal = false')
				.andWhere(new Brackets(qb => {
					qb.where('file.url = :url', { url })
						.orWhere('file.thumbnailUrl = :url', { url })
						.orWhere('file.webpublicUrl = :url', { url });
				}))
				.getOne();
			if (file == null) return 'ignored';

			return await this.reportFile(file);
		} catch (err) {
			// 入口通常是不等待结果的后台调用，任何异常都不能变成未处理的 Promise 拒绝
			this.logger.warn(`report failed: ${err instanceof Error ? err.message : String(err)}`);
			return 'unknown';
		}
	}

	private async reportFile(file: MiDriveFile): Promise<MissingReportResult> {
		const location = this.locate(file);
		if (location == null) return 'ignored';

		const cooled = await this.redisClient.set(KEY.cooldown(file.id), '1', 'EX', CHECK_COOLDOWN_SECONDS, 'NX');
		if (cooled == null) return 'skipped';
		if (!await this.takeProbeBudget()) return 'skipped';

		const probe = await this.probe(location.bucket, location.key);
		if (probe === 'unknown') return 'unknown';

		if (probe === 'present') {
			const removed = await this.reportsRepository.delete({ fileId: file.id });
			return (removed.affected ?? 0) > 0 ? 'cleared' : 'present';
		}

		// 对象缺失：先证明端点与凭证可用，排除凭证/网络/端点故障
		if (!await this.storageLooksHealthy(file)) {
			this.logger.warn(`object ${location.bucket}/${location.key} seems missing but the storage health check failed; not recording ${file.id}`);
			return 'unknown';
		}

		await this.upsertReport(file, location);
		return 'recorded';
	}

	private async upsertReport(file: MiDriveFile, location: ObjectLocation): Promise<void> {
		const now = new Date();
		const updated = await this.reportsRepository.createQueryBuilder()
			.update()
			.set({
				bucket: location.bucket,
				objectKey: location.key,
				scope: location.scope,
				reportCount: () => '"reportCount" + 1',
				lastReportedAt: now,
				verifiedAt: now,
			})
			.where('"fileId" = :fileId', { fileId: file.id })
			.execute();
		if ((updated.affected ?? 0) > 0) return;

		// 唯一索引兜底并发：两个请求同时首次上报时，输的一方静默忽略
		await this.reportsRepository.createQueryBuilder()
			.insert()
			.values({
				id: this.idService.gen(),
				fileId: file.id,
				bucket: location.bucket,
				objectKey: location.key,
				scope: location.scope,
				reportCount: 1,
				firstReportedAt: now,
				lastReportedAt: now,
				verifiedAt: now,
			})
			.orIgnore()
			.execute();
	}
	//#endregion

	//#region 管理员操作
	/**
	 * 重新核实选中的记录：对象存在则移除记录，明确缺失则刷新核实时间，其余保持不动。
	 * 永不抛出。
	 */
	@bindThis
	public async recheck(reportIds: string[]): Promise<MissingBatchSummary> {
		return await this.processBatch(reportIds, async (report, file, location) => {
			const probe = await this.probe(location.bucket, location.key);
			if (probe === 'unknown') return 'unknown';
			if (probe === 'present') {
				await this.reportsRepository.delete({ id: report.id });
				return 'present';
			}
			await this.reportsRepository.update({ id: report.id }, { verifiedAt: new Date(), bucket: location.bucket, objectKey: location.key, scope: location.scope });
			return 'missing';
		});
	}

	/**
	 * 删除选中的记录对应的网盘文件。每条都用当前配置重新解析位置并 HEAD，
	 * 必须明确 404 才删除；对象存储本身不可用（金丝雀失败）时整批中止。
	 * 每个用户收到一条通知。
	 */
	@bindThis
	public async deleteReported(reportIds: string[], moderator: MiUser): Promise<MissingBatchSummary> {
		// 每个用户本批被删文件的 MIME 列表，用于选择通知文案
		const deletedByUser = new Map<string, string[]>();
		const summary = await this.processBatch(reportIds, async (report, file, location) => {
			const probe = await this.probe(location.bucket, location.key);
			if (probe === 'unknown') return 'unknown';
			if (probe === 'present') {
				await this.reportsRepository.delete({ id: report.id });
				return 'present';
			}

			const deleted = await this.driveService.deleteFileWithMissingObject(file, moderator);
			if (!deleted) return 'unknown';
			if (file.userId) deletedByUser.set(file.userId, [...(deletedByUser.get(file.userId) ?? []), file.type]);
			return 'deleted';
		});

		// 通知放在删除全部提交之后；失败只记日志，不影响已提交的删除
		for (const [userId, mimes] of deletedByUser) {
			try {
				// 全是图片才说「图片」，混有其他类型就说「文件」
				const notice = buildMissingObjectNotice(mimes.every(m => m.startsWith('image/')));
				this.notificationService.createNotification(userId, 'app', {
					appAccessTokenId: null,
					customBody: notice.text,
					customHeader: notice.title,
					customIcon: this.meta.iconUrl,
				});
			} catch (err) {
				this.logger.warn(`failed to notify ${userId}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
		return summary;
	}

	private async processBatch(
		reportIds: string[],
		handle: (report: { id: string; fileId: string }, file: MiDriveFile, location: ObjectLocation) => Promise<MissingBatchResult>,
	): Promise<MissingBatchSummary> {
		const ids = [...new Set(reportIds)].slice(0, MISSING_BATCH_MAX);
		const items: MissingBatchItemResult[] = [];
		if (ids.length === 0) return { items, aborted: false };

		const reports = await this.reportsRepository.findBy(ids.map(id => ({ id })));
		const byId = new Map(reports.map(r => [r.id, r]));

		// 整批先过一次端点健康检查：不可用就一个都不动。
		// 对照池要排除本批待处理的文件——它们多半正是缺失文件，若算进对照会把「整批都缺失」误判成「存储不健康」，
		// 导致管理员永远删不掉这批文件
		const batchFileIds = new Set(reports.map(r => r.fileId));
		const canary = await this.storageHealthy(batchFileIds);
		if (!canary) {
			this.logger.warn('batch aborted: storage health check failed');
			return { items: ids.map(id => ({ id, result: byId.has(id) ? 'unknown' : 'gone' } satisfies MissingBatchItemResult)), aborted: true };
		}

		for (const id of ids) {
			const report = byId.get(id);
			if (report == null) {
				items.push({ id, result: 'gone' });
				continue;
			}
			try {
				const file = await this.driveFilesRepository.findOneBy({ id: report.fileId });
				if (file == null) {
					await this.reportsRepository.delete({ id: report.id });
					items.push({ id, result: 'gone' });
					continue;
				}
				// 位置必须按「当前配置」重新解析：配置变更后无法解析的一律不动
				const location = this.locate(file);
				if (location == null) {
					items.push({ id, result: 'unknown' });
					continue;
				}
				items.push({ id, result: await handle(report, file, location) });
			} catch (err) {
				this.logger.warn(`batch item ${id} failed: ${err instanceof Error ? err.message : String(err)}`);
				items.push({ id, result: 'unknown' });
			}
		}
		return { items, aborted: false };
	}
	//#endregion

	//#region 内部
	/** 文件是否属于「当前配置下可核查的对象存储本地文件」，并给出对象位置。 */
	private locate(file: MiDriveFile): ObjectLocation | null {
		if (!this.meta.useObjectStorage) return null;
		if (file.storedInternal || file.isLink || file.userHost !== null || file.accessKey == null) return null;
		return resolveObjectLocation(file.url, file.accessKey, this.meta);
	}

	private async probe(bucket: string, key: string): Promise<ObjectProbe> {
		try {
			await this.s3Service.head(this.meta, { Bucket: bucket, Key: key });
			return 'present';
		} catch (err) {
			return classifyObjectProbeError(err);
		}
	}

	private async storageHealthy(excludeFileIds?: ReadonlySet<string>): Promise<boolean> {
		const bucket = this.meta.objectStorageBucket;
		if (!bucket) return false;

		const query = this.driveFilesRepository.createQueryBuilder('f')
			.where('f.storedInternal = false')
			.andWhere('f.isLink = false')
			.andWhere('f.userHost IS NULL')
			.andWhere('f.accessKey IS NOT NULL');
		if (excludeFileIds != null && excludeFileIds.size > 0) query.andWhere('f.id NOT IN (:...ids)', { ids: [...excludeFileIds] });
		const candidates = await query.orderBy('f.id', 'DESC').limit(10).getMany();

		for (const candidate of candidates) {
			if (candidate.accessKey == null) continue;
			const location = resolveObjectLocation(candidate.url, candidate.accessKey, this.meta);
			// 对照对象必须在当前桶：遗留桶里的对象本身就可能已丢失，不能用来证明端点健康
			if (location == null || location.scope !== 'current') continue;
			// 只有金丝雀明确存在才算健康；缺失或不确定都继续试下一个，最终仍没有存在者则不健康
			if (await this.probe(location.bucket, location.key) === 'present') return true;
		}
		return false;
	}

	private async storageLooksHealthy(missing: MiDriveFile): Promise<boolean> {
		// 上报路径用短 TTL 缓存，避免每次上报都重复打一轮金丝雀（成本放大）。
		// 缓存只影响「是否记入待审表」，删除时仍实时核实，误报可由后续人工+实时核实兜住。
		const cached = await this.redisClient.get(KEY.healthy);
		if (cached === '1') return true;
		if (cached === '0') return false;

		const healthy = await this.storageHealthy(new Set([missing.id]));
		await this.redisClient.set(KEY.healthy, healthy ? '1' : '0', 'EX', HEALTH_CACHE_SECONDS);
		return healthy;
	}

	private async takeProbeBudget(): Promise<boolean> {
		const key = KEY.budget(Math.floor(Date.now() / 60_000));
		const used = await this.redisClient.incr(key);
		if (used === 1) await this.redisClient.expire(key, 120);
		return used <= REPORT_PROBE_BUDGET_PER_MINUTE;
	}
	//#endregion
}
