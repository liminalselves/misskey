/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCheckin1775800000000 {
	name = 'AgentCheckin1775800000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		// Meta: 签到设置 jsonb 列
		await queryRunner.query(`ALTER TABLE "meta" ADD IF NOT EXISTS "agentCheckinSettings" jsonb`);

		// 签到记录表
		await queryRunner.query(`CREATE TABLE IF NOT EXISTS "agent_checkin_record" (
			"id" varchar(32) NOT NULL,
			"userId" varchar(32) NOT NULL,
			"date" varchar(10) NOT NULL,
			"reward" double precision NOT NULL DEFAULT 0,
			"streakAtCheckin" integer NOT NULL,
			"baseValue" double precision NOT NULL,
			"streakMultiplier" double precision NOT NULL,
			"roleMultiplier" double precision NOT NULL,
			"dayMultiplier" double precision NOT NULL,
			"isMakeup" boolean NOT NULL DEFAULT false,
			"makeupCost" double precision,
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			CONSTRAINT "PK_agent_checkin_record" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_checkin_record_userId_date" ON "agent_checkin_record" ("userId", "date")`);
		await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_agent_checkin_record_userId_date_unique" ON "agent_checkin_record" ("userId", "date")`);
		await queryRunner.query(`ALTER TABLE "agent_checkin_record" ADD CONSTRAINT "FK_agent_checkin_record_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE`);

		// agent_model_usage_log: 免费额度快照列（若尚未存在）
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" ADD IF NOT EXISTS "usedFreeQuota" boolean`);
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" ADD IF NOT EXISTS "freeQuotaUsedAtCall" integer`);
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" ADD IF NOT EXISTS "freeQuotaTotalAtCall" integer`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" DROP COLUMN IF EXISTS "freeQuotaTotalAtCall"`);
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" DROP COLUMN IF EXISTS "freeQuotaUsedAtCall"`);
		await queryRunner.query(`ALTER TABLE "agent_model_usage_log" DROP COLUMN IF EXISTS "usedFreeQuota"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "agent_checkin_record"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentCheckinSettings"`);
	}
}
