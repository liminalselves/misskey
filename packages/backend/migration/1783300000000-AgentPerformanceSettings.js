/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentPerformanceSettings1783300000000 {
	name = 'AgentPerformanceSettings1783300000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentPerformanceEnabled" boolean NOT NULL DEFAULT true`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentPerformanceSystemPrompt" text`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentPerformanceSystemPrompt"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentPerformanceEnabled"`);
	}
}
