/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Optimizes chat/messages/user-timeline API by adding a composite index
 * for 1-on-1 chat queries: (fromUserId, toUserId) OR (fromUserId=other, toUserId=me)
 * Prevents "statement timeout" errors for new users.
 */

export class AddChatMessage1on1TimelineIndex1770400000000 {
	name = 'AddChatMessage1on1TimelineIndex1770400000000';

	async up(queryRunner) {
		await queryRunner.query(`CREATE INDEX "IDX_chat_message_1on1_timeline" ON "chat_message" ("fromUserId", "id", "toUserId")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_chat_message_1on1_timeline"`);
	}
}
