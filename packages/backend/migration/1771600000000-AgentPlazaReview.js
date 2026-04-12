/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentPlazaReview1771600000000 {
	name = 'AgentPlazaReview1771600000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`
			CREATE TABLE "agent_plaza_review" (
				"id" character varying(32) NOT NULL,
				"noteId" character varying(32) NOT NULL,
				"userId" character varying(32) NOT NULL,
				"characterId" character varying(32),
				"styleId" character varying(32),
				"stars" smallint NOT NULL,
				CONSTRAINT "PK_agent_plaza_review" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_agent_plaza_review_noteId" UNIQUE ("noteId"),
				CONSTRAINT "CHK_agent_plaza_review_target" CHECK (
					("characterId" IS NOT NULL AND "styleId" IS NULL) OR
					("characterId" IS NULL AND "styleId" IS NOT NULL)
				),
				CONSTRAINT "CHK_agent_plaza_review_stars" CHECK ("stars" >= 0 AND "stars" <= 5),
				CONSTRAINT "FK_agent_plaza_review_note" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE NO ACTION
			)
		`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_plaza_review_character" ON "agent_plaza_review" ("characterId")`);
		await queryRunner.query(`CREATE INDEX "IDX_agent_plaza_review_style" ON "agent_plaza_review" ("styleId")`);
		await queryRunner.query(`
			CREATE UNIQUE INDEX "UQ_agent_plaza_review_user_character"
			ON "agent_plaza_review" ("userId", "characterId")
			WHERE "characterId" IS NOT NULL
		`);
		await queryRunner.query(`
			CREATE UNIQUE INDEX "UQ_agent_plaza_review_user_style"
			ON "agent_plaza_review" ("userId", "styleId")
			WHERE "styleId" IS NOT NULL
		`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "public"."UQ_agent_plaza_review_user_style"`);
		await queryRunner.query(`DROP INDEX "public"."UQ_agent_plaza_review_user_character"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_plaza_review_style"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_agent_plaza_review_character"`);
		await queryRunner.query(`DROP TABLE "agent_plaza_review"`);
	}
}
