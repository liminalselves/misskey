/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentPublishedVersion1773300000000 {
	name = 'AgentPublishedVersion1773300000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`
			CREATE TABLE "agent_published_version" (
				"id" character varying(32) NOT NULL,
				"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
				"kind" character varying(32) NOT NULL,
				"targetId" character varying(32) NOT NULL,
				"userId" character varying(32) NOT NULL,
				"version" integer NOT NULL,
				"snapshot" jsonb NOT NULL,
				CONSTRAINT "PK_agent_published_version" PRIMARY KEY ("id")
			)
		`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_published_version_kind_target_version" ON "agent_published_version" ("kind", "targetId", "version")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_published_version_kind_target_created" ON "agent_published_version" ("kind", "targetId", "createdAt")`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_published_version_kind_target_created"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_published_version_kind_target_version"`);
		await queryRunner.query(`DROP TABLE "agent_published_version"`);
	}
}
