/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentMessageClientRequestId1774700000000 {
	name = 'AgentMessageClientRequestId1774700000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_message" ADD "clientRequestId" character varying(64)`);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_agent_message_session_client_request_role" ON "agent_message" ("sessionId", "clientRequestId", "role") WHERE "clientRequestId" IS NOT NULL`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_message_session_client_request_role"`);
		await queryRunner.query(`ALTER TABLE "agent_message" DROP COLUMN "clientRequestId"`);
	}
}
