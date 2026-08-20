/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentImageGenerationFileIdIndex1780000000000 {
	name = 'AgentImageGenerationFileIdIndex1780000000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		// 为 agent_image_generation."fileId" 建索引。
		// 智能体生图的自动清理新增了"孤儿文件清扫"：扫描 AI 生图文件夹中没有任何存活生成记录引用的文件，
		// 其判定为 NOT EXISTS (SELECT 1 FROM agent_image_generation g WHERE g."fileId" = file.id AND g."autoCleanedAt" IS NULL)。
		// 无索引时该反向连接会对 agent_image_generation 全表做哈希反连接，生图用户多/历史长时清理成本高。
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_agent_image_generation_file" ON "agent_image_generation" ("fileId")`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_agent_image_generation_file"`);
	}
}
