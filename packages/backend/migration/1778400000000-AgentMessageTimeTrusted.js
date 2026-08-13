/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 消息级「发送时间可信」标记：供时间感知注入历史 user 消息发送时间时过滤导入数据。
 * 导入端点（agents/messages/import-context）写入的消息 createdAt 为导入时刻逐条 +1ms，
 * 并非真实发送时间；本迁移对存量数据按该特征（相邻 createdAt 差 < 10ms 的连续段）标记为不可信。
 */
export class AgentMessageTimeTrusted1778400000000 {
	name = 'AgentMessageTimeTrusted1778400000000';

	async up(queryRunner) {
		await queryRunner.query(
			`ALTER TABLE "agent_message" ADD "timeTrusted" boolean NOT NULL DEFAULT true`,
		);
		// 导入段检测：同一会话内按 (createdAt, id) 排序后，与相邻消息时间差 < 10ms 的整段标记为不可信。
		// 导入写入为 1ms 步进必命中；正常对话（人类输入 + LLM 回复）消息间隔秒级以上，不会误伤。
		await queryRunner.query(
			`UPDATE "agent_message" m
			 SET "timeTrusted" = false
			 WHERE m.id IN (
			   SELECT id FROM (
			     SELECT id,
			       EXTRACT(EPOCH FROM ("createdAt" - LAG("createdAt") OVER (PARTITION BY "sessionId" ORDER BY "createdAt", "id"))) AS diff_prev,
			       EXTRACT(EPOCH FROM (LEAD("createdAt") OVER (PARTITION BY "sessionId" ORDER BY "createdAt", "id") - "createdAt")) AS diff_next
			     FROM "agent_message"
			   ) t
			   WHERE (t.diff_prev IS NOT NULL AND t.diff_prev < 0.01)
			      OR (t.diff_next IS NOT NULL AND t.diff_next < 0.01)
			 )`,
		);
	}

	async down(queryRunner) {
		await queryRunner.query(
			`ALTER TABLE "agent_message" DROP COLUMN "timeTrusted"`,
		);
	}
}
