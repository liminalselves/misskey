/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentMessageSessionIdIndex1771200000000 {
	name = 'AgentMessageSessionIdIndex1771200000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`CREATE INDEX "IDX_agent_message_session_id" ON "agent_message" ("sessionId", "id" DESC)`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_message_session_id"`);
	}
}
