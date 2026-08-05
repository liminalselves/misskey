/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCharacterRules1778300000000 {
	name = 'AgentCharacterRules1778300000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "rules" jsonb NOT NULL DEFAULT '[]'`);
		await queryRunner.query(`ALTER TABLE "agent_session" ADD "ruleOverrides" jsonb NOT NULL DEFAULT '{}'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "ruleOverrides"`);
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "rules"`);
	}
}
