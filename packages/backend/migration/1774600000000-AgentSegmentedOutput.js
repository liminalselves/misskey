/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentSegmentedOutput1774600000000 {
	name = 'AgentSegmentedOutput1774600000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "segmentedOutputEnabled" boolean NOT NULL DEFAULT false`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "segmentedOutputEnabled"`);
	}
}
