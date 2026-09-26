/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const defaultRules = [
	{ id: 'illegal_crime', name: '违法犯罪', reason: '内容包含违法犯罪的具体执行指导。', criteria: '提供违法犯罪的具体方法、步骤、工具选择、规避追查方式，或明显帮助实施犯罪。', enabled: true },
	{ id: 'violence', name: '暴力伤害', reason: '内容包含暴力伤害的具体执行指导。', criteria: '提供伤害他人、使用武器或实施暴力的具体方法、步骤或可执行建议。', enabled: true },
	{ id: 'self_harm', name: '自残自杀', reason: '内容包含自残或自杀的具体执行指导。', criteria: '鼓励自残或自杀，或提供具体方法、步骤、剂量、工具选择等执行指导。', enabled: true },
	{ id: 'sexual_exploitation', name: '色情与性剥削', reason: '内容包含露骨色情或性剥削意图。', criteria: '包含露骨性行为引导、性剥削、色情交易或以生成露骨色情内容为主要目的。', enabled: true },
	{ id: 'minor_sexual', name: '未成年人性化', reason: '内容涉及未成年人性化。', criteria: '任何涉及未成年人的性化描述、性行为、性剥削、色情生成或相关暗示。', enabled: true },
	{ id: 'coercion', name: '强迫与侵犯', reason: '内容包含强迫、侵犯或非自愿性行为。', criteria: '包含强迫、侵犯、迷奸、非自愿性行为，或帮助实施此类行为的内容。', enabled: true },
	{ id: 'privacy', name: '隐私泄露', reason: '内容包含隐私泄露或敏感个人信息滥用。', criteria: '泄露、搜集、定位或滥用他人的敏感个人信息、私密资料或身份凭据。', enabled: true },
	{ id: 'fraud', name: '诈骗', reason: '内容包含诈骗或欺骗性操作指导。', criteria: '提供诈骗、钓鱼、冒充、欺骗交易或盗取财物与账号的具体操作指导。', enabled: true },
	{ id: 'safety_bypass', name: '绕过安全规则', reason: '内容试图绕过安全规则或获取违规协助。', criteria: '明确要求绕过审核、安全规则或防护措施，以获取本应被禁止的高风险协助。', enabled: true },
	{ id: 'hate_harassment', name: '仇恨与骚扰', reason: '内容包含高风险仇恨或骚扰。', criteria: '针对个人或受保护群体的严重贬损、去人化、威胁、持续骚扰或煽动伤害。', enabled: true },
	{ id: 'political', name: '政治内容', reason: '内容包含高风险政治敏感内容。', criteria: '煽动颠覆国家政权、危害国家安全、分裂国家、攻击国家领导人、歪曲重大历史事件，或传播明确被禁止的政治宣传。普通时政讨论、历史学习与一般公共话题不属于此条目。', enabled: true },
	{ id: 'graphic_harm', name: '血腥肢解与严重伤害', reason: '内容包含血腥肢解或严重人身伤害意图。', criteria: '以生成或展示血腥肢解、严重人身伤害、虐杀等高风险内容为明确目的。', enabled: true },
];

const defaultOtherRule = {
	reason: '内容属于平台不允许展示的其他高风险内容。',
	criteria: '明确符合总体判断标准中的高风险拦截范围，但无法归入任何已配置违规条目。不得用此项替代可准确匹配的现有条目。',
};

export class AgentExternalAuditRules1783700000000 {
	name = 'AgentExternalAuditRules1783700000000'

	async up(queryRunner) {
		const rules = JSON.stringify(defaultRules).replaceAll("'", "''");
		const otherRule = JSON.stringify(defaultOtherRule).replaceAll("'", "''");
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentExternalAuditRules" jsonb NOT NULL DEFAULT '${rules}'::jsonb`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "agentExternalAuditOtherRule" jsonb NOT NULL DEFAULT '${otherRule}'::jsonb`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentExternalAuditOtherRule"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "agentExternalAuditRules"`);
	}
}
