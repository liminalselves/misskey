/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCompressionInjectSiteSetting1784700000000 {
	name = 'AgentCompressionInjectSiteSetting1784700000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentCompressionInjectMaxChars" integer NOT NULL DEFAULT 4000`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentCompressionInjectMaxChars"`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentCompressionInjectMaxChars" integer NOT NULL DEFAULT 4000`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentCompressionInjectMaxChars"`);
	}
}
