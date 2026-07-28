/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentImageGenerationInitialPlaceholderUnique1774100000000 {
	name = 'AgentImageGenerationInitialPlaceholderUnique1774100000000';

	async up(queryRunner) {
		await queryRunner.query(`
			CREATE UNIQUE INDEX "IDX_agent_image_generation_initial_placeholder"
			ON "agent_image_generation" ("messageId", "placeholderIndex")
			WHERE "messageId" IS NOT NULL AND "regenerationOfId" IS NULL
		`);
	}

	async down(queryRunner) {
		await queryRunner.query('DROP INDEX "public"."IDX_agent_image_generation_initial_placeholder"');
	}
}
