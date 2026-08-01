/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCreditMigration1777000000000 {
	name = 'AgentCreditMigration1777000000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		// 额度迁移日志表
		await queryRunner.query(`CREATE TABLE IF NOT EXISTS "agent_credit_migration" (
			"id" varchar(32) NOT NULL,
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"targetUserId" varchar(32) NOT NULL,
			"amount" double precision NOT NULL,
			"requestId" varchar(128),
			"sourceInfo" varchar(512),
			"operatorId" varchar(32) NOT NULL,
			"status" varchar(16) NOT NULL DEFAULT 'success',
			"failReason" varchar(512),
			CONSTRAINT "PK_agent_credit_migration" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_credit_migration_createdAt" ON "agent_credit_migration" ("createdAt")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_credit_migration_targetUserId" ON "agent_credit_migration" ("targetUserId")`);
		await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_agent_credit_migration_requestId" ON "agent_credit_migration" ("requestId") WHERE "requestId" IS NOT NULL`);
		await queryRunner.query(`ALTER TABLE "agent_credit_migration" ADD CONSTRAINT "FK_agent_credit_migration_target_user" FOREIGN KEY ("targetUserId") REFERENCES "user"("id") ON DELETE CASCADE`);
		await queryRunner.query(`ALTER TABLE "agent_credit_migration" ADD CONSTRAINT "FK_agent_credit_migration_operator" FOREIGN KEY ("operatorId") REFERENCES "user"("id") ON DELETE CASCADE`);

		// Meta: 迁移授权 Key 哈希
		await queryRunner.query(`ALTER TABLE "meta" ADD IF NOT EXISTS "agentMigrationKeyHash" varchar(128)`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN IF EXISTS "agentMigrationKeyHash"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "agent_credit_migration"`);
	}
}
