/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AgentUsageLogBackfillModelId1782000000000 {
	name = 'AgentUsageLogBackfillModelId1782000000000';

	/**
	 * 历史用量日志 modelId 回填：
	 * 旧版聊天/主动消息在会话未指定模型时直接把 session.agentModelId（NULL）写入日志，
	 * 实际调用的是全站默认模型，导致报表中这批记录被归入"未关联模型"且不参与免费额度/按量计费解析。
	 * 回填规则（按优先级）：
	 * 1. 日志的 modelApiName 与当前生效默认模型的 apiModelName 一致（默认模型从未变更时即调用时刻的实际模型）→ 默认模型 id；
	 *    modelApiName 为 NULL 的行同样归入默认模型（解析失败时调用本身也会失败，归因影响可忽略）；
	 * 2. modelApiName 能唯一对应到某个已配置模型（含已下架）→ 该模型 id（配置漂移时的兜底）；
	 * 3. 其余（对应不到或歧义）保持 NULL，留在报表"未关联模型"分类中，不强行归因。
	 * 仅回填模型调用类记录；签到/奖励/迁移类记录不含模型，保持原样。
	 *
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async up(queryRunner) {
		const metaRows = await queryRunner.query(`SELECT "agentLlmModels", "agentDefaultModelId" FROM "meta" LIMIT 1`);
		const meta = metaRows[0];
		const rawModels = meta?.agentLlmModels;
		if (!Array.isArray(rawModels) || rawModels.length === 0) return;

		const valid = [];
		for (const m of rawModels) {
			if (m == null || typeof m !== 'object') continue;
			const id = typeof m.id === 'string' ? m.id.trim() : '';
			const apiModelName = typeof m.apiModelName === 'string' ? m.apiModelName.trim() : '';
			if (!id || !apiModelName) continue;
			valid.push({ id, apiModelName, unlisted: m.unlisted === true });
		}
		if (valid.length === 0) return;

		const defaultId = typeof meta.agentDefaultModelId === 'string' ? meta.agentDefaultModelId.trim() : '';
		const active = valid.filter(m => !m.unlisted);
		const defaultModel = active.find(m => m.id === defaultId) ?? active[0] ?? null;

		// apiModelName → 唯一对应的模型 id；多模型共用同一 apiModelName 时无法消歧，跳过
		const apiNameToIds = new Map();
		for (const m of valid) {
			const ids = apiNameToIds.get(m.apiModelName) ?? [];
			ids.push(m.id);
			apiNameToIds.set(m.apiModelName, ids);
		}

		const kinds = "'chat', 'compression', 'image_generation', 'vision', 'proactive_random', 'proactive_scheduled'";
		if (defaultModel != null) {
			await queryRunner.query(
				`UPDATE "agent_model_usage_log" SET "modelId" = $1 WHERE "modelId" IS NULL AND "usageKind" IN (${kinds}) AND ("modelApiName" = $2 OR "modelApiName" IS NULL)`,
				[defaultModel.id, defaultModel.apiModelName],
			);
		}
		for (const [apiModelName, ids] of apiNameToIds) {
			if (ids.length !== 1) continue;
			if (defaultModel != null && apiModelName === defaultModel.apiModelName) continue;
			await queryRunner.query(
				`UPDATE "agent_model_usage_log" SET "modelId" = $1 WHERE "modelId" IS NULL AND "usageKind" IN (${kinds}) AND "modelApiName" = $2`,
				[ids[0], apiModelName],
			);
		}
	}

	/**
	 * @param {import('typeorm').QueryRunner} queryRunner
	 */
	async down(queryRunner) {
		// 数据回填不可逆：回填前的 NULL 已无法与真实为 NULL 的记录区分，不做还原。
	}
}
