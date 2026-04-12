/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentPlazaStatsDialogueStyleSnapshot1771650000000 {
	name = 'AgentPlazaStatsDialogueStyleSnapshot1771650000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`
			ALTER TABLE "agent_session"
			ADD "plazaStatsDialogueStyleId" character varying(32) NULL
		`);
		await queryRunner.query(`
			UPDATE "agent_session"
			SET "plazaStatsDialogueStyleId" = "dialogueStyleId"
		`);
		await queryRunner.query(`
			ALTER TABLE "agent_message"
			ADD "statsDialogueStyleId" character varying(32) NULL
		`);
		await queryRunner.query(`
			UPDATE "agent_message" AS m
			SET "statsDialogueStyleId" = s."dialogueStyleId"
			FROM "agent_session" AS s
			WHERE m."sessionId" = s."id"
		`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_message" DROP COLUMN "statsDialogueStyleId"`);
		await queryRunner.query(`ALTER TABLE "agent_session" DROP COLUMN "plazaStatsDialogueStyleId"`);
	}
}
