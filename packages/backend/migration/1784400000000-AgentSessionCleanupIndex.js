/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const isConcurrentIndexMigrationEnabled = process.env.MISSKEY_MIGRATION_CREATE_INDEX_CONCURRENTLY === '1';
const indexName = 'IDX_agent_session_cleanup_created';

function concurrentlyIfAllowed(queryRunner) {
	// TypeORM migration:revert can wrap down() in a transaction.
	return isConcurrentIndexMigrationEnabled && !queryRunner.isTransactionActive ? 'CONCURRENTLY ' : '';
}

export class AgentSessionCleanupIndex1784400000000 {
	name = 'AgentSessionCleanupIndex1784400000000';
	transaction = isConcurrentIndexMigrationEnabled ? false : undefined;

	async up(queryRunner) {
		const rows = await queryRunner.query(`
			SELECT i.indisvalid AS "isValid"
			FROM pg_index i
			INNER JOIN pg_class c ON i.indexrelid = c.oid
			WHERE c.relname = $1 AND pg_table_is_visible(c.oid)
		`, [indexName]);
		if (rows[0]?.isValid !== true) {
			await queryRunner.query(`DROP INDEX ${concurrentlyIfAllowed(queryRunner)}IF EXISTS "${indexName}"`);
			await queryRunner.query(`CREATE INDEX ${concurrentlyIfAllowed(queryRunner)}"${indexName}" ON "agent_session" ("createdAt", "id")`);
		}
		await queryRunner.query('ANALYZE "agent_session"');
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX ${concurrentlyIfAllowed(queryRunner)}IF EXISTS "${indexName}"`);
	}
}
