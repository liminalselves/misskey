/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentMem0AddMemoryContextRounds1771450000000 {
	name = 'AgentMem0AddMemoryContextRounds1771450000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentMem0AddMemoryMaxRounds" integer NOT NULL DEFAULT 3`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentLongMemoryAddMaxRounds" integer`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentLongMemoryAddMaxRounds"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentMem0AddMemoryMaxRounds"`);
	}
}
