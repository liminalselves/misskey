/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const isConcurrentIndexMigrationEnabled = process.env.MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY === '1';

export class ChatHistoryIndexes1774800000000 {
	name = 'ChatHistoryIndexes1774800000000';
	transaction = isConcurrentIndexMigrationEnabled ? false : undefined;

	async up(queryRunner) {
		if (isConcurrentIndexMigrationEnabled) {
			const hasValidIndex = await queryRunner.query(`SELECT indisvalid FROM pg_index INNER JOIN pg_class ON pg_index.indexrelid = pg_class.oid WHERE pg_class.relname = 'IDX_chat_message_room_timeline'`);
			if (hasValidIndex.length === 0 || hasValidIndex[0].indisvalid !== true) {
				await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_chat_message_room_timeline"`);
				await queryRunner.query(`CREATE INDEX CONCURRENTLY "IDX_chat_message_room_timeline" ON "chat_message" ("toRoomId", "id" DESC) WHERE "toRoomId" IS NOT NULL`);
			}
		} else {
			await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_message_room_timeline" ON "chat_message" ("toRoomId", "id" DESC) WHERE "toRoomId" IS NOT NULL`);
		}

		await queryRunner.query(`ANALYZE "chat_message", "chat_room_membership", "chat_room"`);
	}

	async down(queryRunner) {
		const concurrently = isConcurrentIndexMigrationEnabled ? 'CONCURRENTLY' : '';
		await queryRunner.query(`DROP INDEX ${concurrently} IF EXISTS "IDX_chat_message_room_timeline"`);
	}
}
