/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentModelReportResolution1783900000000 {
	name = 'AgentModelReportResolution1783900000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_model_report" ADD COLUMN "resolvedAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`ALTER TABLE "agent_model_report" ADD COLUMN "resolvedByUserId" varchar(32)`);
		await queryRunner.query(`ALTER TABLE "agent_model_report" ADD COLUMN "resolutionMessage" varchar(2000)`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_model_report_resolved_time" ON "agent_model_report" ("resolvedAt", "createdAt")`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_model_report_resolved_time"`);
		await queryRunner.query(`ALTER TABLE "agent_model_report" DROP COLUMN "resolutionMessage"`);
		await queryRunner.query(`ALTER TABLE "agent_model_report" DROP COLUMN "resolvedByUserId"`);
		await queryRunner.query(`ALTER TABLE "agent_model_report" DROP COLUMN "resolvedAt"`);
	}
}
