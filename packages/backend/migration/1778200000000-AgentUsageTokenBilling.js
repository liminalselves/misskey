/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentUsageTokenBilling1778200000000 {
	name = 'AgentUsageTokenBilling1778200000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" ADD "promptCacheHitTokens" integer`);
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" ADD "promptCacheMissTokens" integer`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" DROP COLUMN "promptCacheMissTokens"`);
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" DROP COLUMN "promptCacheHitTokens"`);
	}
}
