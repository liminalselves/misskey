/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCompressionStickyUniqueFingerprint1773000000000 {
	name = 'AgentCompressionStickyUniqueFingerprint1773000000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		// 部分唯一索引：仅对 sourceFingerprint 非空的行生效，防止并发下同一会话产生重复压缩便签
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_acs_sticky_session_fingerprint" ON "agent_session_compression_sticky" ("sessionId", "sourceFingerprint") WHERE "sourceFingerprint" IS NOT NULL`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_acs_sticky_session_fingerprint"`);
	}
}
