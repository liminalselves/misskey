/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentSessionModerationBannedReason1776100000000 {
	name = 'AgentSessionModerationBannedReason1776100000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ADD IF NOT EXISTS "moderationBannedReason" character varying(1000)`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN IF EXISTS "moderationBannedReason"`);
	}
}
