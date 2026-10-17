/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCompressionInjectLimit1784600000000 {
	name = 'AgentCompressionInjectLimit1784600000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentCompressionInjectMaxChars" integer NOT NULL DEFAULT 4000`);
		await queryRunner.query(`UPDATE "agent_session" SET "agentCompressionInjectMaxChars" = GREATEST(200, LEAST(50000, "agentLongMemoryInjectMaxChars")) WHERE "agentLongMemoryProvider" = 'compression'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentCompressionInjectMaxChars"`);
	}
}
