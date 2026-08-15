/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentUserModels1779000000000 {
	name = 'AgentUserModels1779000000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		// 用户自定义模型（BYOK）
		await queryRunner.query(`CREATE TABLE IF NOT EXISTS "agent_user_model" (
			"id" varchar(32) NOT NULL,
			"userId" varchar(32) NOT NULL,
			"name" varchar(256) NOT NULL,
			"baseUrl" varchar(512) NOT NULL,
			"apiKey" text,
			"apiModelName" varchar(256) NOT NULL,
			"maxContextTokens" integer NOT NULL DEFAULT 8192,
			"maxOutputTokensPerCall" integer NOT NULL DEFAULT 2048,
			"tokenizerEncoding" varchar(64),
			"charsPerToken" integer,
			"providerId" varchar(64),
			"enabled" boolean NOT NULL DEFAULT true,
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			CONSTRAINT "PK_agent_user_model" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_user_model_userId" ON "agent_user_model" ("userId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_agent_user_model_userId_name" ON "agent_user_model" ("userId", "name")`);
		await queryRunner.query(`ALTER TABLE "agent_user_model" ADD CONSTRAINT "FK_agent_user_model_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE`);

		// Meta: BYOK 开关 / 半设置提供商模板 / 数量上限
		await queryRunner.query(`ALTER TABLE "meta" ADD IF NOT EXISTS "agentByokEnabled" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD IF NOT EXISTS "agentByokProviders" jsonb`);
		await queryRunner.query(`ALTER TABLE "meta" ADD IF NOT EXISTS "agentByokMaxUserModels" integer NOT NULL DEFAULT 20`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentByokMaxUserModels"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentByokProviders"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentByokEnabled"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "agent_user_model"`);
	}
}
