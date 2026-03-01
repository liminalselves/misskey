/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Fixes timeline index column order and adds partial indexes for userHistory.
 * Run only if you already ran AddChatMessage1on1TimelineIndex with the old (fromUserId, id, toUserId) definition.
 */

export class AddChatMessage1on1HistoryIndexes1770400000001 {
	name = 'AddChatMessage1on1HistoryIndexes1770400000001';

	async up(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_message_1on1_timeline"`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_message_1on1_timeline" ON "chat_message" ("fromUserId", "toUserId", "id" DESC)`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_message_1on1_from" ON "chat_message" ("fromUserId", "id" DESC) WHERE "toRoomId" IS NULL`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_message_1on1_to" ON "chat_message" ("toUserId", "id" DESC) WHERE "toRoomId" IS NULL`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_message_1on1_to"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_message_1on1_from"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_message_1on1_timeline"`);
	}
}
