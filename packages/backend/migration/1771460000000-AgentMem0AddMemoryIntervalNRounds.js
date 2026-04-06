/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentMem0AddMemoryIntervalNRounds1771460000000 {
	name = 'AgentMem0AddMemoryIntervalNRounds1771460000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentMem0AddMemoryEveryNRounds" integer NOT NULL DEFAULT 1`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentLongMemoryAddEveryNRounds" integer`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentLongMemoryAddEveryNRounds"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentMem0AddMemoryEveryNRounds"`);
	}
}
