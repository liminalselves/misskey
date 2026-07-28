/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentSessionTimeAwareness1774700000000 {
	name = 'AgentSessionTimeAwareness1774700000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "timeAwarenessEnabled" boolean NOT NULL DEFAULT true`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "timeAwarenessEnabled"`);
	}
}
