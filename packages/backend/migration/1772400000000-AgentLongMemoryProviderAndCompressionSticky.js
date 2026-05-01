/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentLongMemoryProviderAndCompressionSticky1772400000000 {
	name = 'AgentLongMemoryProviderAndCompressionSticky1772400000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "agentLongMemoryProvider" character varying(32) NOT NULL DEFAULT 'aliyun'`);
		await queryRunner.query(`CREATE TABLE "agent_session_compression_sticky" (
			"id" character varying(32) NOT NULL,
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"sessionId" character varying(32) NOT NULL,
			"fromMessageId" character varying(32) NOT NULL,
			"toMessageId" character varying(32) NOT NULL,
			"summaryText" text NOT NULL,
			"state" character varying(32) NOT NULL,
			"userOverridden" boolean NOT NULL DEFAULT false,
			"sourceFingerprint" character varying(128),
			"errorMessage" text,
			"lastModelId" character varying(64),
			"sortIndex" integer NOT NULL DEFAULT 0,
			CONSTRAINT "PK_agent_session_compression_sticky" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`CREATE INDEX "IDX_acs_sticky_session" ON "agent_session_compression_sticky" ("sessionId")`);
		await queryRunner.query(`CREATE INDEX "IDX_acs_sticky_session_sort" ON "agent_session_compression_sticky" ("sessionId", "sortIndex")`);
		await queryRunner.query(`ALTER TABLE "agent_session_compression_sticky" ADD CONSTRAINT "FK_acs_sticky_session" FOREIGN KEY ("sessionId") REFERENCES "agent_session"("id") ON DELETE CASCADE`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "agent_session_compression_sticky"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "agentLongMemoryProvider"`);
	}
}
