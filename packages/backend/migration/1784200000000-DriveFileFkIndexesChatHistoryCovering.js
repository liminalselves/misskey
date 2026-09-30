/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 1) Upgrade chat 1-on-1 history partial indexes to covering form so that
 *    ChatService.userHistory (GROUP BY otherId) no longer heap-fetches every
 *    row of a user's messages.
 * 2) Add missing indexes on FK columns referencing drive_file, so that
 *    DELETE FROM drive_file no longer seq-scans child tables.
 */

const isConcurrentIndexMigrationEnabled = process.env.MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY === '1';

const chatHistoryIndexes = [
	{
		name: 'IDX_chat_message_1on1_from',
		buildName: 'IDX_chat_message_1on1_from_build_1784200000000',
		backupName: 'IDX_chat_message_1on1_from_backup_1784200000000',
		coveringColumns: '"fromUserId", "toUserId", "id" DESC',
		legacyColumns: '"fromUserId", "id" DESC',
	},
	{
		name: 'IDX_chat_message_1on1_to',
		buildName: 'IDX_chat_message_1on1_to_build_1784200000000',
		backupName: 'IDX_chat_message_1on1_to_backup_1784200000000',
		coveringColumns: '"toUserId", "fromUserId", "id" DESC',
		legacyColumns: '"toUserId", "id" DESC',
	},
];

const driveFileFkIndexes = [
	// user.avatarId and user.bannerId already have UNIQUE indexes created by
	// their one-to-one constraints (REL_58f5... / REL_afc64...), so adding
	// ordinary indexes for those columns would only duplicate write overhead.
	['IDX_chat_message_fileId', 'chat_message', '"fileId"'],
	['IDX_messaging_message_fileId', 'messaging_message', '"fileId"'],
	['IDX_page_eyeCatchingImageId', 'page', '"eyeCatchingImageId"'],
	['IDX_channel_bannerId', 'channel', '"bannerId"'],
];

async function getIndexState(queryRunner, indexName) {
	const rows = await queryRunner.query(`
		SELECT i.indisvalid AS "isValid", i.indnkeyatts AS "keyCount"
		FROM pg_index i
		INNER JOIN pg_class c ON i.indexrelid = c.oid
		WHERE c.relname = $1 AND c.relkind = 'i' AND pg_table_is_visible(c.oid)
	`, [indexName]);
	return rows[0] ?? null;
}

function isValidIndexWithKeyCount(state, keyCount) {
	return state?.isValid === true && Number(state.keyCount) === keyCount;
}

function concurrentlyIfAllowed(queryRunner) {
	// TypeORM wraps migration:revert in a transaction even when this migration's
	// up() opted out. PostgreSQL forbids CONCURRENTLY inside a transaction block.
	return isConcurrentIndexMigrationEnabled && !queryRunner.isTransactionActive ? 'CONCURRENTLY ' : '';
}

async function dropIndex(queryRunner, indexName) {
	await queryRunner.query(`DROP INDEX ${concurrentlyIfAllowed(queryRunner)}IF EXISTS "${indexName}"`);
}

async function replaceChatHistoryIndex(queryRunner, index, columns, keyCount) {
	let current = await getIndexState(queryRunner, index.name);
	let build = await getIndexState(queryRunner, index.buildName);
	let backup = await getIndexState(queryRunner, index.backupName);

	// A previous interrupted run may already have completed the swap but not the cleanup.
	if (isValidIndexWithKeyCount(current, keyCount)) {
		if (build) await dropIndex(queryRunner, index.buildName);
		if (backup) await dropIndex(queryRunner, index.backupName);
		return;
	}

	// Build and validate the replacement while the current index remains available.
	if (build && !isValidIndexWithKeyCount(build, keyCount)) {
		await dropIndex(queryRunner, index.buildName);
		build = null;
	}
	if (!build) {
		await queryRunner.query(`CREATE INDEX ${concurrentlyIfAllowed(queryRunner)}"${index.buildName}" ON "chat_message" (${columns}) WHERE "toRoomId" IS NULL`);
	}
	build = await getIndexState(queryRunner, index.buildName);
	if (!isValidIndexWithKeyCount(build, keyCount)) {
		throw new Error(`Replacement index ${index.buildName} is not valid`);
	}

	// Preserve the old index under a backup name until the valid replacement has
	// taken over the canonical name. Every interruption point remains restartable.
	current = await getIndexState(queryRunner, index.name);
	backup = await getIndexState(queryRunner, index.backupName);
	if (current) {
		if (backup) await dropIndex(queryRunner, index.backupName);
		await queryRunner.query(`ALTER INDEX "${index.name}" RENAME TO "${index.backupName}"`);
	}
	await queryRunner.query(`ALTER INDEX "${index.buildName}" RENAME TO "${index.name}"`);
	if (await getIndexState(queryRunner, index.backupName)) {
		await dropIndex(queryRunner, index.backupName);
	}
}

async function ensureFkIndex(queryRunner, indexName, table, column) {
	const state = await getIndexState(queryRunner, indexName);
	if (isValidIndexWithKeyCount(state, 1)) return;
	if (state) await dropIndex(queryRunner, indexName);
	await queryRunner.query(`CREATE INDEX ${concurrentlyIfAllowed(queryRunner)}"${indexName}" ON "${table}" (${column})`);
}

export class DriveFileFkIndexesChatHistoryCovering1784200000000 {
	name = 'DriveFileFkIndexesChatHistoryCovering1784200000000';
	transaction = isConcurrentIndexMigrationEnabled ? false : undefined;

	async up(queryRunner) {
		for (const index of chatHistoryIndexes) {
			await replaceChatHistoryIndex(queryRunner, index, index.coveringColumns, 3);
		}

		// messaging_message is a legacy table no longer represented by an entity;
		// older databases may retain it while newer databases may not have it.
		const existingTables = new Set(
			(await queryRunner.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`))
				.map(row => row.table_name),
		);
		const analyzable = [];
		for (const [indexName, table, column] of driveFileFkIndexes) {
			if (!existingTables.has(table)) continue;
			analyzable.push(table);
			await ensureFkIndex(queryRunner, indexName, table, column);
		}

		const analyzeTargets = [...new Set(['chat_message', ...analyzable])];
		await queryRunner.query(`ANALYZE ${analyzeTargets.map(table => `"${table}"`).join(', ')}`);
	}

	async down(queryRunner) {
		for (const index of chatHistoryIndexes) {
			await replaceChatHistoryIndex(queryRunner, index, index.legacyColumns, 2);
		}
		for (const [indexName] of driveFileFkIndexes) {
			await dropIndex(queryRunner, indexName);
		}
	}
}
