/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentReviewPublishedSnapshot1771350000000 {
	name = 'AgentReviewPublishedSnapshot1771350000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "reviewStatus" character varying(32) NOT NULL DEFAULT 'draft'`);
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "publishedVersion" integer`);
		await queryRunner.query(`ALTER TABLE "agent_character" ADD "publishedSnapshot" jsonb`);

		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" ADD "summary" character varying(512)`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" ADD "reviewStatus" character varying(32) NOT NULL DEFAULT 'draft'`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" ADD "publishedVersion" integer`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" ADD "publishedSnapshot" jsonb`);

		await queryRunner.query(`
			UPDATE "agent_character" SET
				"reviewStatus" = 'published',
				"publishedVersion" = 0,
				"publishedSnapshot" = jsonb_strip_nulls(jsonb_build_object(
					'name', "name",
					'summary', "summary",
					'personality', "personality",
					'background', "background",
					'speakingStyle', "speakingStyle",
					'greeting', "greeting",
					'exampleDialogue', "exampleDialogue",
					'forbiddenBehavior', "forbiddenBehavior",
					'avatarFileId', "avatarFileId"
				))
			WHERE "isPublished" = true
		`);
		await queryRunner.query(`
			UPDATE "agent_dialogue_style" SET
				"reviewStatus" = 'published',
				"publishedVersion" = 0,
				"publishedSnapshot" = jsonb_strip_nulls(jsonb_build_object(
					'name', "name",
					'body', "body",
					'summary', NULL
				))
			WHERE "isPublished" = true
		`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" DROP COLUMN "publishedSnapshot"`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" DROP COLUMN "publishedVersion"`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" DROP COLUMN "reviewStatus"`);
		await queryRunner.query(`ALTER TABLE "agent_dialogue_style" DROP COLUMN "summary"`);

		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "publishedSnapshot"`);
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "publishedVersion"`);
		await queryRunner.query(`ALTER TABLE "agent_character" DROP COLUMN "reviewStatus"`);
	}
}
