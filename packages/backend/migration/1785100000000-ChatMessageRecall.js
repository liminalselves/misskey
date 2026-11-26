/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatMessageRecall1785100000000 {
	name = 'ChatMessageRecall1785100000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN IF EXISTS "editedAt"`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "recalledAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_message"."recalledAt" IS 'The date and time when the message was recalled.'`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "recalledById" character varying(32)`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_message"."recalledById" IS 'The ID of the user who recalled the message.'`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD CONSTRAINT "FK_chat_message_recalledById" FOREIGN KEY ("recalledById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" DROP CONSTRAINT IF EXISTS "FK_chat_message_recalledById"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN IF EXISTS "recalledById"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN IF EXISTS "recalledAt"`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "editedAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`COMMENT ON COLUMN "chat_message"."editedAt" IS 'The date and time when the message was last edited.'`);
	}
}
