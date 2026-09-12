/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentExternalAuditFailureKind1783200000000 {
	name = 'AgentExternalAuditFailureKind1783200000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" ADD "failureKind" character varying(16)`);
		// 回填历史失败记录：回复内容缺失/无法解析为 allow|block JSON 归为 parse，其余请求阶段错误归为 api
		await queryRunner.query(`UPDATE "agent_external_audit_log" SET "failureKind" = 'parse' WHERE "status" = 'failed' AND "errorCode" IN ('AUDIT_MODEL_UNPARSEABLE_DECISION', 'AUDIT_MODEL_EMPTY_RESPONSE')`);
		await queryRunner.query(`UPDATE "agent_external_audit_log" SET "failureKind" = 'api' WHERE "status" = 'failed' AND "failureKind" IS NULL`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_external_audit_log" DROP COLUMN "failureKind"`);
	}
}
