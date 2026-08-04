/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentReviewTriggerRules1774000000000 {
	name = 'AgentReviewTriggerRules1774000000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentReviewTriggerRules" jsonb NOT NULL DEFAULT '[]'::jsonb`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentReviewTriggerRules"`);
	}
}
