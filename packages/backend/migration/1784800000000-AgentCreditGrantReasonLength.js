/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCreditGrantReasonLength1784800000000 {
	name = 'AgentCreditGrantReasonLength1784800000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" ALTER COLUMN "errorCode" TYPE varchar(200)`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" ALTER COLUMN "errorCode" TYPE varchar(128)`);
	}
}
