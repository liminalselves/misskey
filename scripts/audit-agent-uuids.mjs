/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 智能体模块 ApiError UUID 体检脚本
//
// 用途：扫描 packages/backend/src/(core|server/api/endpoints/agents|server/api/endpoints/admin/agents|daemons)
// 下所有 `id: '<uuid>'` 与就近的 `code: '<NAME>'` 配对，并报告：
//   1) 真撞号：同一 UUID 被不同 code 使用（必修）
//   2) 合法共享：同一 UUID 被同一 code 共享（service.agentsErrors 与 endpoint.meta.errors 的镜像，保留）
//   3) 跨模块撞号：智能体 UUID 与非智能体文件冲突且 code 不同
//
// 用法：`node scripts/audit-agent-uuids.mjs`
//
// 实现注意：仅做静态文本扫描，不做 AST 解析；适用于 Misskey 当前 ApiError 直写风格。
// 如果某天 ApiError 改为通过常量/工厂统一构造，本脚本需要相应调整就近 code 抽取逻辑。

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const REPO = process.cwd();
const SRC = join(REPO, 'packages', 'backend', 'src');

const AGENT_DIRS = [
	join(SRC, 'server', 'api', 'endpoints', 'agents'),
	join(SRC, 'server', 'api', 'endpoints', 'admin', 'agents'),
];
const AGENT_FILES_EXTRA = [
	join(SRC, 'core', 'AgentService.ts'),
	join(SRC, 'core', 'AgentCompressionMemoryService.ts'),
	join(SRC, 'core', 'AgentDashscopeMemoryService.ts'),
	join(SRC, 'core', 'AgentModelUsageService.ts'),
	join(SRC, 'core', 'AgentPlazaReviewService.ts'),
	join(SRC, 'daemons', 'AgentSessionCleanupService.ts'),
];

function walk(dir) {
	const out = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		const s = statSync(p);
		if (s.isDirectory()) out.push(...walk(p));
		else if (p.endsWith('.ts')) out.push(p);
	}
	return out;
}

const agentFiles = new Set();
for (const d of AGENT_DIRS) {
	try { walk(d).forEach(f => agentFiles.add(f)); } catch {}
}
for (const f of AGENT_FILES_EXTRA) agentFiles.add(f);

const allFiles = walk(SRC);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

/** 收集 (uuid, code, file, line) */
function collect(files) {
	const recs = [];
	for (const f of files) {
		const text = readFileSync(f, 'utf8');
		const lines = text.split(/\r?\n/);
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const uuidMatch = line.match(UUID_RE);
			if (!uuidMatch) continue;
			for (const u of uuidMatch) {
				let code = null;
				// 优先：同一行内有 code: 'XXX'
				const sameLine = line.match(/code:\s*'([^']+)'/);
				if (sameLine) code = sameLine[1];
				else {
					// 向上至多 3 行找 code:
					for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
						const m = lines[j].match(/code:\s*'([^']+)'/);
						if (m) { code = m[1]; break; }
					}
				}
				recs.push({ uuid: u, code, file: f, line: i + 1 });
			}
		}
	}
	return recs;
}

const agentRecs = collect([...agentFiles]);
const allRecs = collect(allFiles);

// 按 UUID 分组
function group(recs) {
	const m = new Map();
	for (const r of recs) {
		if (!m.has(r.uuid)) m.set(r.uuid, []);
		m.get(r.uuid).push(r);
	}
	return m;
}

const agentByUuid = group(agentRecs);
const allByUuid = group(allRecs);

function rel(f) { return f.replace(REPO + sep, '').replace(/\\/g, '/'); }

// 1) 智能体模块内真撞号（不同 code）
console.log('=== A. 智能体模块内：不同 code 共享同一 UUID（真撞号）===');
for (const [uuid, recs] of agentByUuid) {
	const codes = new Set(recs.map(r => r.code ?? '(unknown)'));
	if (codes.size > 1) {
		console.log(`\n[UUID] ${uuid}`);
		for (const r of recs) console.log(`    ${r.code ?? '(?)'}  -- ${rel(r.file)}:${r.line}`);
	}
}

// 2) 智能体模块内合法共享（同 code），仅作信息提示
console.log('\n=== B. 智能体模块内：同 code 共享 UUID（合法、保留）===');
for (const [uuid, recs] of agentByUuid) {
	const codes = new Set(recs.map(r => r.code ?? '(unknown)'));
	if (codes.size === 1 && recs.length > 1) {
		const code = [...codes][0];
		console.log(`\n[UUID] ${uuid}  code=${code}`);
		for (const r of recs) console.log(`    ${rel(r.file)}:${r.line}`);
	}
}

// 3) 智能体 UUID 在非智能体文件中也出现（跨模块撞号）
const agentUuidSet = new Set(agentByUuid.keys());
console.log('\n=== C. 智能体 UUID 在非智能体文件中也出现（跨模块撞号）===');
for (const uuid of agentUuidSet) {
	const all = allByUuid.get(uuid) || [];
	const nonAgent = all.filter(r => ![...agentFiles].includes(r.file));
	if (nonAgent.length === 0) continue;
	// 检查 code 是否也不同
	const allCodes = new Set(all.map(r => r.code ?? '(?)'));
	if (allCodes.size > 1) {
		console.log(`\n[UUID] ${uuid}  跨模块且 code 不同`);
		for (const r of all) {
			const isAgent = [...agentFiles].includes(r.file);
			console.log(`    ${isAgent ? '[agent]' : '[other]'} ${r.code ?? '(?)'}  -- ${rel(r.file)}:${r.line}`);
		}
	}
}

// 统计
console.log('\n=== 统计 ===');
console.log(`智能体文件数: ${agentFiles.size}`);
console.log(`智能体内 UUID 记录数: ${agentRecs.length}`);
console.log(`智能体内 UUID 去重数: ${agentByUuid.size}`);
let conflicts = 0;
for (const [, recs] of agentByUuid) {
	if (new Set(recs.map(r => r.code ?? '(?)')).size > 1) conflicts++;
}
console.log(`真撞号 UUID 数: ${conflicts}`);
