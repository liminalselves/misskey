/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCompressionStickyRetryCount1775700000000 {
	name = 'AgentCompressionStickyRetryCount1775700000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session_compression_sticky" ADD "retryCount" integer NOT NULL DEFAULT 0`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session_compression_sticky" DROP COLUMN "retryCount"`);
	}
}
