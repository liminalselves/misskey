/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentModelReports1783800000000 {
	name = 'AgentModelReports1783800000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		// 用户上报的模型异常（modelId/modelName 为上报时快照）
		await queryRunner.query(`CREATE TABLE IF NOT EXISTS "agent_model_report" (
			"id" varchar(32) NOT NULL,
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"userId" varchar(32) NOT NULL,
			"modelKind" varchar(16) NOT NULL,
			"modelId" varchar(64) NOT NULL,
			"modelName" varchar(256) NOT NULL,
			"reasonType" varchar(32) NOT NULL,
			"comment" varchar(1024),
			CONSTRAINT "PK_agent_model_report" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_model_report_user" ON "agent_model_report" ("userId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_model_report_model_time" ON "agent_model_report" ("modelId", "createdAt")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_model_report_time" ON "agent_model_report" ("createdAt")`);
		await queryRunner.query(`ALTER TABLE "agent_model_report" ADD CONSTRAINT "FK_agent_model_report_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE IF EXISTS "agent_model_report"`);
	}
}
