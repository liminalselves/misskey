/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentSessionLongMemory1771100000000 {
	name = 'AgentSessionLongMemory1771100000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentLongMemoryEnabled" boolean NOT NULL DEFAULT true`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentLongMemoryTopK" integer NOT NULL DEFAULT 8`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentLongMemoryMinScore" double precision`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentLongMemoryInjectMaxChars" integer NOT NULL DEFAULT 4000`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentLongMemoryInjectMaxChars"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentLongMemoryMinScore"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentLongMemoryTopK"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentLongMemoryEnabled"`);
	}
}
