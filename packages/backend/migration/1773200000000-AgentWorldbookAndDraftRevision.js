/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentWorldbookAndDraftRevision1773200000000 {
	name = 'AgentWorldbookAndDraftRevision1773200000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "worldbook" jsonb NOT NULL DEFAULT '[]'::jsonb`);
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "draftRevision" integer NOT NULL DEFAULT 1`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" ADD "draftRevision" integer NOT NULL DEFAULT 1`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" DROP COLUMN "draftRevision"`);
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "draftRevision"`);
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "worldbook"`);
	}
}
