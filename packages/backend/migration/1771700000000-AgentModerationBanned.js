/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentModerationBanned1771700000000 {
	name = 'AgentModerationBanned1771700000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "moderationBanned" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "moderationBanned" boolean NOT NULL DEFAULT false`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "moderationBanned"`);
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "moderationBanned"`);
	}
}
