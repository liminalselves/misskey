/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCompressionModelIds1772900000000 {
	name = 'AgentCompressionModelIds1772900000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentCompressionDefaultModelId" character varying(64)`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentCompressionModelId" character varying(64)`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentCompressionModelId"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentCompressionDefaultModelId"`);
	}
}
