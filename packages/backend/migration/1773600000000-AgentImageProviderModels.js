/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentImageProviderModels1773600000000 {
	name = 'AgentImageProviderModels1773600000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentImageModels" jsonb NOT NULL DEFAULT '[]'::jsonb`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentImageModelId" character varying(128)`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentImageSettings" jsonb NOT NULL DEFAULT '{}'::jsonb`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentImageSettings"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentImageModelId"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentImageModels"`);
	}
}
