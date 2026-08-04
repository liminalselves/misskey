/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentExternalAuditReviewIgnore1774100000000 {
	name = 'AgentExternalAuditReviewIgnore1774100000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" ADD "reviewIgnoredAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" ADD "reviewIgnoredById" character varying(32)`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" DROP COLUMN "reviewIgnoredById"`);
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" DROP COLUMN "reviewIgnoredAt"`);
	}
}
