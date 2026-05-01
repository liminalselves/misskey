/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentModelUsageLogUsageKind1773000000000 {
	name = 'AgentModelUsageLogUsageKind1773000000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" ADD "usageKind" character varying(16) NOT NULL DEFAULT 'chat'`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" DROP COLUMN "usageKind"`);
	}
}
