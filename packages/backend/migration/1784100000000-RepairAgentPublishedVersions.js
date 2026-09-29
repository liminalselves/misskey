/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';

export class RepairAgentPublishedVersions1784100000000 {
	name = 'RepairAgentPublishedVersions1784100000000';

	/**
	 * 修复审核归档插入失败留下的半发布数据，以及历史功能上线前缺少当前归档的数据。
	 * 旧历史版本保持不可变；当前发布快照无法由 publishedVersion 对应的归档准确表示时，
	 * 将当前快照补成一个不与历史冲突的版本，再让主表指向该版本。
	 *
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`SET LOCAL statement_timeout = 0`);
		await this.repairKind(queryRunner, { kind: 'character', table: 'agent_character' });
		await this.repairKind(queryRunner, { kind: 'style', table: 'agent_dialogue_style' });
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 * @param {{ kind: 'character' | 'style', table: string }} target
	 */
	async repairKind(queryRunner, target) {
		// 先锁住所有可能参与发布生命周期的行。每行随后用一条新语句重读归档，
		// 避免等待在线审核释放行锁后仍使用旧语句快照计算版本号。
		const candidates = await queryRunner.query(`
			SELECT "id"
			FROM "${target.table}"
			WHERE "publishedVersion" IS NOT NULL
				OR "publishedSnapshot" IS NOT NULL
				OR "isPublished" = true
				OR "reviewStatus" IN ('pending', 'published')
			ORDER BY "id"
			FOR UPDATE
		`);

		for (const candidate of candidates) {
			const rows = await queryRunner.query(`
				SELECT
					m."id",
					m."userId",
					m."reviewStatus",
					m."isPublished",
					m."publishedVersion",
					m."publishedSnapshot",
					current_version."snapshot" AS "archivedSnapshot",
					(current_version."snapshot" IS NOT DISTINCT FROM m."publishedSnapshot") AS "archiveMatchesMain",
					COALESCE(history."maxVersion", -1) AS "maxVersion"
				FROM "${target.table}" m
				LEFT JOIN "agent_published_version" current_version
					ON current_version."kind" = $1
					AND current_version."targetId" = m."id"
					AND current_version."version" = m."publishedVersion"
				LEFT JOIN (
					SELECT MAX(v."version") AS "maxVersion"
					FROM "agent_published_version" v
					WHERE v."kind" = $1 AND v."targetId" = $2
				) history ON true
				WHERE m."id" = $2
			`, [target.kind, candidate.id]);
			const row = rows[0];
			if (!row) continue;

			if (row.publishedVersion == null) {
				await queryRunner.query(`
					UPDATE "${target.table}"
					SET "publishedSnapshot" = NULL,
						"isPublished" = false,
						"reviewStatus" = CASE WHEN "reviewStatus" = 'published' THEN 'draft' ELSE "reviewStatus" END
					WHERE "id" = $1
						AND ("publishedSnapshot" IS NOT NULL OR "isPublished" = true OR "reviewStatus" = 'published')
				`, [row.id]);
				continue;
			}

			let currentSnapshot = row.publishedSnapshot;
			if (currentSnapshot == null) {
				if (row.archivedSnapshot == null) {
					throw new Error(`Cannot repair ${target.kind} ${row.id}: published version ${row.publishedVersion} has no snapshot in either the main row or archive.`);
				}
				currentSnapshot = row.archivedSnapshot;
			}

			const archiveMatches = row.archivedSnapshot != null && (row.publishedSnapshot == null || row.archiveMatchesMain === true);
			let repairedVersion = Number(row.publishedVersion);
			if (!archiveMatches) {
				const maxVersion = Number(row.maxVersion);
				repairedVersion = row.archivedSnapshot == null && repairedVersion > maxVersion
					? repairedVersion
					: maxVersion + 1;
				await queryRunner.query(`
					INSERT INTO "agent_published_version"
						("id", "createdAt", "kind", "targetId", "userId", "version", "snapshot")
					VALUES ($1, now(), $2, $3, $4, $5, $6)
				`, [
					randomUUID().replaceAll('-', ''),
					target.kind,
					row.id,
					row.userId,
					repairedVersion,
					currentSnapshot,
				]);
			}

			await queryRunner.query(`
				UPDATE "${target.table}"
				SET "publishedVersion" = $1,
					"publishedSnapshot" = $2,
					"isPublished" = true,
					"reviewStatus" = CASE WHEN "reviewStatus" = 'pending' THEN 'pending' ELSE 'published' END
				WHERE "id" = $3
			`, [repairedVersion, currentSnapshot, row.id]);
		}
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		// 数据修复不可逆：新增归档已经成为合法历史，无法安全判断哪些版本应删除。
	}
}
