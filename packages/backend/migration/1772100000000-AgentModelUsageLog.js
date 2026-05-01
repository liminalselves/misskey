/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentModelUsageLog1772100000000 {
	name = 'AgentModelUsageLog1772100000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "agent_model_usage_log" (
			"id" character varying(32) NOT NULL,
			"requestedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"completedAt" TIMESTAMP WITH TIME ZONE,
			"durationMs" integer,
			"userId" character varying(32) NOT NULL,
			"sessionId" character varying(32),
			"characterId" character varying(32),
			"dialogueStyleId" character varying(32),
			"modelId" character varying(64),
			"modelApiName" character varying(256),
			"status" character varying(16) NOT NULL,
			"errorCode" character varying(128),
			"cost" double precision NOT NULL DEFAULT 0,
			"promptTokens" integer,
			"completionTokens" integer,
			CONSTRAINT "PK_agent_model_usage_log" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_model_usage_log_user_time" ON "agent_model_usage_log" ("userId", "requestedAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_model_usage_log_time" ON "agent_model_usage_log" ("requestedAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_model_usage_log_model_time" ON "agent_model_usage_log" ("modelId", "requestedAt")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_model_usage_log_status_time" ON "agent_model_usage_log" ("status", "requestedAt")`);

		await queryRunner.query(`ALTER TABLE "user_profile" ADD "agentCreditBalance" double precision NOT NULL DEFAULT 0`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "agentCreditBalance"`);
		await queryRunner.query(`DROP INDEX "IDX_agent_model_usage_log_status_time"`);
		await queryRunner.query(`DROP INDEX "IDX_agent_model_usage_log_model_time"`);
		await queryRunner.query(`DROP INDEX "IDX_agent_model_usage_log_time"`);
		await queryRunner.query(`DROP INDEX "IDX_agent_model_usage_log_user_time"`);
		await queryRunner.query(`DROP TABLE "agent_model_usage_log"`);
	}
}
