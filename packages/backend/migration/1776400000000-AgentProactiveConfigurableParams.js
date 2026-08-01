/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentProactiveConfigurableParams1776400000000 {
	name = 'AgentProactiveConfigurableParams1776400000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentProactiveRandomDefaultEnabled" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentProactiveScheduledDefaultEnabled" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentProactiveMinSilenceMinutes" integer NOT NULL DEFAULT 30`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentProactiveMaxWindowMinutes" integer NOT NULL DEFAULT 1410`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentProactiveDaytimeWeight" integer NOT NULL DEFAULT 3`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "randomProactiveMinSilenceMinutes" integer`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "randomProactiveMaxWindowMinutes" integer`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "randomProactiveDaytimeWeight" integer`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "randomProactiveDaytimeWeight"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "randomProactiveMaxWindowMinutes"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "randomProactiveMinSilenceMinutes"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentProactiveDaytimeWeight"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentProactiveMaxWindowMinutes"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentProactiveMinSilenceMinutes"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentProactiveScheduledDefaultEnabled"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentProactiveRandomDefaultEnabled"`);
	}
}
