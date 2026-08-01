/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentProactiveRecencyBias1776500000000 {
	name = 'AgentProactiveRecencyBias1776500000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentProactiveRecencyBias" integer NOT NULL DEFAULT 1`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "randomProactiveRecencyBias" integer`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "randomProactiveRecencyBias"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentProactiveRecencyBias"`);
	}
}
