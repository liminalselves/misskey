/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCheckinMakeupSource1783400000000 {
	name = 'AgentCheckinMakeupSource1783400000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_checkin_record" ADD COLUMN "makeupSource" varchar(16)`);
		await queryRunner.query(`UPDATE "agent_checkin_record" SET "makeupSource" = 'user' WHERE "isMakeup" = true`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_checkin_record" DROP COLUMN "makeupSource"`);
	}
}
