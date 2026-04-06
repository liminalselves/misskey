/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentModelsAndStyleSubs1770900000000 {
	name = 'AgentModelsAndStyleSubs1770900000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentLlmModels" jsonb`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentDefaultModelId" character varying(64)`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentModelId" character varying(64)`);

		await queryRunner.query(`
			CREATE TABLE "agent_user_style_subscription" (
				"userId" character varying(32) NOT NULL,
				"styleId" character varying(32) NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				CONSTRAINT "PK_agent_user_style_subscription" PRIMARY KEY ("userId", "styleId")
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_style_sub_style" ON "agent_user_style_subscription" ("styleId")`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_style_sub_style"`);
		await queryRunner.query(`DROP TABLE "agent_user_style_subscription"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentModelId"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentDefaultModelId"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentLlmModels"`);
	}
}
