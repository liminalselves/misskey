/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentProactiveMessageChain1783500000000 {
	name = 'AgentProactiveMessageChain1783500000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ADD COLUMN "randomProactiveChainLength" integer NOT NULL DEFAULT 1`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD COLUMN "randomProactiveChainRemaining" integer NOT NULL DEFAULT 0`);
		await queryRunner.query(`UPDATE "agent_session" SET "randomProactiveChainRemaining" = 1 WHERE "randomProactiveAt" IS NOT NULL AND "randomProactiveNeedsUserMessage" = false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN "agentProactiveMaxChainLength" integer NOT NULL DEFAULT 7`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentProactiveMaxChainLength"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "randomProactiveChainRemaining"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "randomProactiveChainLength"`);
	}
}
