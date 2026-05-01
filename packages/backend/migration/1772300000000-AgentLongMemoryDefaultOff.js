/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 新会话默认不向语义记忆写入/检索（已有行不变，新插入 default false）
 */
export class AgentLongMemoryDefaultOff1772300000000 {
	name = 'AgentLongMemoryDefaultOff1772300000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		await queryRunner.query(
			`ALTER TABLE "agent_session" ALTER COLUMN "agentLongMemoryEnabled" SET DEFAULT false`,
		);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(
			`ALTER TABLE "agent_session" ALTER COLUMN "agentLongMemoryEnabled" SET DEFAULT true`,
		);
	}
}
