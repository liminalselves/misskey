export class AddChatMessageReplyId1770300000000 {
    name = 'AddChatMessageReplyId1770300000000';
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_message" ADD "replyId" character varying(32)`);
        await queryRunner.query(`CREATE INDEX "IDX_chat_message_replyId" ON "chat_message" ("replyId")`);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "IDX_chat_message_replyId"`);
        await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "replyId"`);
    }
}
