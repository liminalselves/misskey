/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AddChatMessageReplyId1770300000000 {
    name = 'AddChatMessageReplyId1770300000000';
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_message" ADD "replyId" character varying(32)`);
        await queryRunner.query(`CREATE INDEX "IDX_f747e8c550656a9389dd5e2f92" ON "chat_message" ("replyId")`);
        await queryRunner.query(`ALTER TABLE "chat_message" ADD CONSTRAINT "FK_f747e8c550656a9389dd5e2f923" FOREIGN KEY ("replyId") REFERENCES "chat_message"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_message" DROP CONSTRAINT IF EXISTS "FK_f747e8c550656a9389dd5e2f923"`);
        await queryRunner.query(`ALTER TABLE "chat_message" DROP CONSTRAINT IF EXISTS "FK_chat_message_replyId"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_f747e8c550656a9389dd5e2f92"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_message_replyId"`);
        await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "replyId"`);
    }
}
