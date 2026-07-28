/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentImageGenerationManualSource1774000000000 {
	name = 'AgentImageGenerationManualSource1774000000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_image_generation" ALTER COLUMN "messageId" DROP NOT NULL`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DELETE FROM "agent_image_generation" WHERE "messageId" IS NULL`);
		await queryRunner.query(`ALTER TABLE "agent_image_generation" ALTER COLUMN "messageId" SET NOT NULL`);
	}
}
