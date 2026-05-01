/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentSessionLongMemoryProviderDefaultNone1772600000000 {
	name = 'AgentSessionLongMemoryProviderDefaultNone1772600000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ALTER COLUMN "agentLongMemoryProvider" SET DEFAULT 'none'`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "agent_session" ALTER COLUMN "agentLongMemoryProvider" SET DEFAULT 'aliyun'`);
	}
}
