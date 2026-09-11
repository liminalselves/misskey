/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentCharacterStickers1783100000000 {
	name = 'AgentCharacterStickers1783100000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "stickers" jsonb NOT NULL DEFAULT '[]'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "stickers"`);
	}
}
