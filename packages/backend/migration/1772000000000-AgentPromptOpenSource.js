/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentPromptOpenSource1772000000000 {
	name = 'AgentPromptOpenSource1772000000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "promptOpenSourced" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" ADD "promptOpenSourced" boolean NOT NULL DEFAULT false`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" DROP COLUMN "promptOpenSourced"`);
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "promptOpenSourced"`);
	}
}
