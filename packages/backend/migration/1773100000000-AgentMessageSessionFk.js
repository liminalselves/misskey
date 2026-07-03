/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 给 `agent_message.sessionId` 补齐 PostgreSQL 层外键 + ON DELETE CASCADE。
 *
 * 背景：
 *  - 初版迁移 `1770800000000-AgentFeature.js` 建 `agent_message` 时**未**写 FOREIGN KEY；
 *    实体 `MiAgentMessage` 上的 `@ManyToOne({ onDelete: 'CASCADE' })` 在 `synchronize: false`
 *    生产模式下仅是「开发者注释」，库层不会自动建约束。
 *  - 后果：直接 SQL 删 session 或绕过应用层的清理路径会留下 sessionId 找不到对应 session 的
 *    孤儿 agent_message 行，长期累积污染审计统计。
 *
 * 本迁移：
 *  1. 先把 `sessionId` 不在 `agent_session.id` 内的孤儿行删干净（应用层从不写出这种行，
 *     只可能来自历史绕路或异常状态），通过 RAISE NOTICE 报告删除条数；
 *  2. 加 `FOREIGN KEY (sessionId) REFERENCES agent_session(id) ON DELETE CASCADE`；
 *  3. up 使用 `IF NOT EXISTS` 保护，可在已建过的库上重复执行（满足体检报告里
 *     「迁移可重复执行性」的整改方向）。
 *
 * down：移除 FK 即可；不补回孤儿数据（已删的数据无从恢复）。
 */
export class AgentMessageSessionFk1773100000000 {
	name = 'AgentMessageSessionFk1773100000000';

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		// 1) 清理孤儿：仅删 sessionId 找不到对应 session 的 agent_message 行。
		//    应用层每条写入都伴随 session 存在性校验，这里删除的全部是历史脏数据。
		await queryRunner.query(`
			DO $$
			DECLARE
				orphan_count BIGINT;
			BEGIN
				SELECT COUNT(*) INTO orphan_count
				FROM "agent_message" m
				WHERE NOT EXISTS (
					SELECT 1 FROM "agent_session" s WHERE s."id" = m."sessionId"
				);
				IF orphan_count > 0 THEN
					RAISE NOTICE 'AgentMessageSessionFk1773100000000: deleting % orphan agent_message rows', orphan_count;
					DELETE FROM "agent_message" m
					WHERE NOT EXISTS (
						SELECT 1 FROM "agent_session" s WHERE s."id" = m."sessionId"
					);
				END IF;
			END $$;
		`);

		// 2) 加 FK；显式给约束命名以便将来 ALTER / DROP 时易于定位。
		//    使用 information_schema 防御重复执行（idempotent up）。
		await queryRunner.query(`
			DO $$
			BEGIN
				IF NOT EXISTS (
					SELECT 1 FROM information_schema.table_constraints
					WHERE constraint_name = 'FK_agent_message_session'
						AND table_name = 'agent_message'
				) THEN
					ALTER TABLE "agent_message"
						ADD CONSTRAINT "FK_agent_message_session"
						FOREIGN KEY ("sessionId")
						REFERENCES "agent_session"("id")
						ON DELETE CASCADE
						ON UPDATE NO ACTION;
				END IF;
			END $$;
		`);
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		await queryRunner.query(`
			DO $$
			BEGIN
				IF EXISTS (
					SELECT 1 FROM information_schema.table_constraints
					WHERE constraint_name = 'FK_agent_message_session'
						AND table_name = 'agent_message'
				) THEN
					ALTER TABLE "agent_message" DROP CONSTRAINT "FK_agent_message_session";
				END IF;
			END $$;
		`);
	}
}
