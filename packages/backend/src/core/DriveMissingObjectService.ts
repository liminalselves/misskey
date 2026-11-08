/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { Brackets } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { DriveFilesRepository, MiMeta } from '@/models/_.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { bindThis } from '@/decorators.js';
import { S3Service } from '@/core/S3Service.js';
import { DriveService } from '@/core/DriveService.js';
import { AnnouncementService } from '@/core/AnnouncementService.js';
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

/** 第一次发现缺失后，需要隔这么久再次确认才会修复（挡住 OSS/CDN 的短暂故障）。 */
export const MISSING_CONFIRM_DELAY_MS = 60_000;
/** 同一个文件的核查冷却，避免热点图片被大量访问时反复打 OSS。 */
const CHECK_COOLDOWN_SECONDS = 30;
/** 疑似缺失标记的有效期；超过则作废，需要重新从头确认。 */
const SUSPECT_TTL_SECONDS = 15 * 60;
/** 全站每小时最多自动修复的文件数。 */
export const REPAIR_HOURLY_LIMIT = 20;
/** 10 分钟内出现这么多个不同的缺失文件，就怀疑是整桶异常，暂停修复。 */
export const MASS_MISSING_THRESHOLD = 5;
const MASS_MISSING_WINDOW_SECONDS = 10 * 60;
const BREAKER_PAUSE_SECONDS = 60 * 60;
/** 同一用户 24 小时内只发一条通知。 */
const NOTICE_COOLDOWN_SECONDS = 24 * 60 * 60;

const KEY = {
	cooldown: (fileId: string) => `drive:missing:cooldown:${fileId}`,
	suspect: (fileId: string) => `drive:missing:suspect:${fileId}`,
	recent: 'drive:missing:recent',
	breaker: 'drive:missing:breaker',
	hourly: (hour: number) => `drive:missing:hourly:${hour}`,
	notice: (userId: string) => `drive:missing:notice:${userId}`,
} as const;

export type MissingObjectCheckResult =
	| 'ignored' // 不满足前置条件，或不是对象存储里的本地文件
	| 'skipped' // 冷却中、熔断中或限额已满
	| 'present' // 对象存在，疑似标记已清除
	| 'unknown' // 无法确认，数据保持不动
	| 'suspected' // 首次发现缺失，等待二次确认
	| 'repaired'; // 已确认缺失并修复

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

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private s3Service: S3Service,
		private driveService: DriveService,
		private announcementService: AnnouncementService,
		private loggerService: LoggerService,
	) {
		this.logger = this.loggerService.getLogger('drive-missing-object');
	}

	/** 通过上报的 URL 找到本地文件并核查。URL 无法对应到任何文件时静默忽略。 */
	@bindThis
	public async checkByReportedUrl(rawUrl: string): Promise<MissingObjectCheckResult> {
		try {
			return await this.checkByReportedUrlInternal(rawUrl);
		} catch (err) {
			// 入口通常是不等待结果的后台调用，查询阶段的异常也不能变成未处理的 Promise 拒绝
			this.logger.warn(`check by url failed: ${err instanceof Error ? err.message : String(err)}`);
			return 'unknown';
		}
	}

	private async checkByReportedUrlInternal(rawUrl: string): Promise<MissingObjectCheckResult> {
		const url = extractReportedObjectUrl(rawUrl, this.config.url);
		if (url == null) return 'ignored';

		// 粗筛：主机不属于对象存储的外链不查库；精确归属交给 checkFile 的位置判定
		if (!this.meta.useObjectStorage || !urlMayBelongToObjectStorage(url, this.meta)) return 'ignored';

		// 先用精确 URL 匹配；缩略图/webpublic 上报同样能定位到所属文件
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

		return await this.checkFile(file);
	}

	@bindThis
	public async checkByFileId(fileId: string): Promise<MissingObjectCheckResult> {
		const file = await this.driveFilesRepository.findOneBy({ id: fileId });
		if (file == null) return 'ignored';
		return await this.checkFile(file);
	}

	/**
	 * 核查一个文件的原图是否真的从对象存储中消失，并在多重确认后修复。
	 * 此方法永不抛出：任何异常都等价于「无法确认」，数据保持不动。
	 */
	@bindThis
	public async checkFile(file: MiDriveFile): Promise<MissingObjectCheckResult> {
		try {
			return await this.checkFileInternal(file);
		} catch (err) {
			this.logger.warn(`check failed for ${file.id}: ${err instanceof Error ? err.message : String(err)}`);
			return 'unknown';
		}
	}

	private async checkFileInternal(file: MiDriveFile): Promise<MissingObjectCheckResult> {
		//#region 前置条件：只处理当前桶里的本地用户文件
		if (!this.meta.useObjectStorage) return 'ignored';
		if (file.storedInternal || file.isLink || file.userHost !== null || file.accessKey == null) return 'ignored';

		// 位置判定：属于当前桶，或是同一端点下的遗留桶路径；无法可靠判定（含 accessKey 与 URL 不一致）一律不动
		const location = resolveObjectLocation(file.url, file.accessKey, this.meta);
		if (location == null) return 'ignored';
		//#endregion

		if (await this.isPaused()) return 'skipped';

		// 冷却：同一文件短时间内只核查一次
		const cooled = await this.redisClient.set(KEY.cooldown(file.id), '1', 'EX', CHECK_COOLDOWN_SECONDS, 'NX');
		if (cooled == null) return 'skipped';

		const probe = await this.probe(location.bucket, location.key);
		if (probe === 'unknown') return 'unknown';
		if (probe === 'present') {
			await this.redisClient.del(KEY.suspect(file.id));
			return 'present';
		}

		// 原图缺失：先验证端点与凭证是可用的（用当前桶里另一个确定存在的对象对照），排除凭证/网络/端点故障。
		// 遗留桶同样以当前桶作对照：遗留桶本身可能已整体不存在，不能指望在其中找到「存在的对象」
		if (!await this.bucketLooksHealthy(file)) {
			this.logger.warn(`object ${location.bucket}/${location.key} seems missing but the storage health check failed; leaving ${file.id} untouched`);
			return 'unknown';
		}

		// 熔断在「发现缺失」时就计数，而不是等到删除之后：
		// 整桶故障时，第 N 个疑似文件一出现就暂停，已处于等待确认中的文件也不会被删
		if (!await this.recordMissingAndCheckBreaker(file.id)) return 'skipped';

		// 疑似标记带上对象存储配置指纹：两次确认之间管理员换了桶/端点/凭证时，旧标记作废，从头再来
		const fingerprint = this.storageFingerprint(location);
		const stored = await this.redisClient.get(KEY.suspect(file.id));
		const now = Date.now();
		const separator = stored?.indexOf('|') ?? -1;
		const suspectedAt = stored != null && separator > 0 && stored.slice(separator + 1) === fingerprint
			? Number(stored.slice(0, separator))
			: null;
		if (suspectedAt == null || !Number.isFinite(suspectedAt)) {
			await this.redisClient.set(KEY.suspect(file.id), `${now}|${fingerprint}`, 'EX', SUSPECT_TTL_SECONDS);
			this.logger.warn(`object ${location.bucket}/${location.key} of ${file.id} is missing in object storage (${location.scope} bucket); waiting for confirmation`);
			return 'suspected';
		}

		if (now - suspectedAt < MISSING_CONFIRM_DELAY_MS) return 'suspected';

		// 二次确认通过。小时限额放在真正修改数据之前
		if (!await this.takeHourlyQuota(file.id)) return 'skipped';

		let repaired = false;
		try {
			repaired = await this.driveService.deleteFileWithMissingObject(file);
		} catch (err) {
			// 修复失败（如数据库暂时不可用）：退还额度，保留待确认标记之外不做任何事，下次访问时再试
			await this.redisClient.decr(KEY.hourly(Math.floor(now / 3_600_000))).catch(() => {});
			throw err;
		}
		await this.redisClient.del(KEY.suspect(file.id));
		if (!repaired) return 'ignored';

		this.logger.warn(`repaired drive file ${file.id} (owner ${file.userId}): object ${location.bucket}/${location.key} confirmed missing in object storage (${location.scope} bucket)`);
		if (file.userId) await this.notifyOwner(file);
		return 'repaired';
	}

	/** 决定「对象在哪个桶、用哪套凭证访问」的配置摘要；密钥只以哈希片段参与，不以明文进 Redis。 */
	private storageFingerprint(location: ObjectLocation): string {
		return [
			location.bucket,
			location.key,
			this.meta.objectStorageBucket ?? '',
			this.meta.objectStorageEndpoint ?? '',
			this.meta.objectStorageRegion ?? '',
			this.meta.objectStorageS3ForcePathStyle ? 'path' : 'virtual',
			createHash('sha256').update(`${this.meta.objectStorageAccessKey ?? ''}:${this.meta.objectStorageSecretKey ?? ''}`).digest('hex').slice(0, 12),
		].join('#');
	}

	private async isPaused(): Promise<boolean> {
		return (await this.redisClient.exists(KEY.breaker)) === 1;
	}

	private async probe(bucket: string, key: string): Promise<ObjectProbe> {
		try {
			await this.s3Service.head(this.meta, { Bucket: bucket, Key: key });
			return 'present';
		} catch (err) {
			return classifyObjectProbeError(err);
		}
	}

	/**
	 * 金丝雀：在当前桶里找另一个文件 HEAD 一次，必须明确存在才算端点与凭证可用。
	 * 找不到可对照的文件时按「不健康」处理——宁可不修复。
	 */
	private async bucketLooksHealthy(missing: MiDriveFile): Promise<boolean> {
		const bucket = this.meta.objectStorageBucket;
		if (!bucket) return false;

		const candidates = await this.driveFilesRepository.createQueryBuilder('f')
			.where('f.storedInternal = false')
			.andWhere('f.isLink = false')
			.andWhere('f.userHost IS NULL')
			.andWhere('f.accessKey IS NOT NULL')
			.andWhere('f.id != :id', { id: missing.id })
			.orderBy('f.id', 'DESC')
			.limit(10)
			.getMany();

		for (const candidate of candidates) {
			if (candidate.accessKey == null) continue;
			const candidateLocation = resolveObjectLocation(candidate.url, candidate.accessKey, this.meta);
			// 对照对象必须在当前桶：遗留桶里的对象本身就可能已丢失，不能用来证明端点健康
			if (candidateLocation == null || candidateLocation.scope !== 'current') continue;
			const result = await this.probe(candidateLocation.bucket, candidateLocation.key);
			// 只有金丝雀明确存在才算健康；缺失或不确定都继续试下一个，最终仍没有存在者则不健康
			if (result === 'present') return true;
		}
		return false;
	}

	/** 记录一个疑似缺失的文件；窗口内不同文件过多则触发熔断。返回 false 表示已熔断。 */
	private async recordMissingAndCheckBreaker(fileId: string): Promise<boolean> {
		const now = Date.now();
		await this.redisClient.zadd(KEY.recent, now, fileId);
		await this.redisClient.zremrangebyscore(KEY.recent, 0, now - MASS_MISSING_WINDOW_SECONDS * 1000);
		await this.redisClient.expire(KEY.recent, MASS_MISSING_WINDOW_SECONDS);
		const recentCount = await this.redisClient.zcard(KEY.recent);
		if (recentCount >= MASS_MISSING_THRESHOLD) {
			await this.redisClient.set(KEY.breaker, '1', 'EX', BREAKER_PAUSE_SECONDS);
			this.logger.error(`${recentCount} different drive files looked missing within ${MASS_MISSING_WINDOW_SECONDS / 60} minutes; assuming a bucket-level problem and pausing automatic repair for ${BREAKER_PAUSE_SECONDS / 60} minutes`);
			return false;
		}
		return true;
	}

	/** 小时限额；返回 true 表示已占用一个名额。 */
	private async takeHourlyQuota(fileId: string): Promise<boolean> {
		const now = Date.now();
		const hourKey = KEY.hourly(Math.floor(now / 3_600_000));
		const used = await this.redisClient.incr(hourKey);
		if (used === 1) await this.redisClient.expire(hourKey, 2 * 3600);
		if (used > REPAIR_HOURLY_LIMIT) {
			this.logger.error(`hourly automatic repair limit (${REPAIR_HOURLY_LIMIT}) reached; ${fileId} left untouched`);
			return false;
		}
		return true;
	}

	private async notifyOwner(file: MiDriveFile): Promise<void> {
		try {
			// 24 小时内每个用户只提醒一次，避免一次丢多个文件时刷屏
			const first = await this.redisClient.set(KEY.notice(file.userId!), '1', 'EX', NOTICE_COOLDOWN_SECONDS, 'NX');
			if (first == null) return;

			const notice = buildMissingObjectNotice(file.type);
			await this.announcementService.create({
				title: notice.title,
				text: notice.text,
				icon: 'warning',
				display: 'normal',
				forExistingUsers: false,
				silence: false,
				needConfirmationToRead: false,
				userId: file.userId,
			});
		} catch (err) {
			this.logger.warn(`failed to notify the owner of ${file.id}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}
