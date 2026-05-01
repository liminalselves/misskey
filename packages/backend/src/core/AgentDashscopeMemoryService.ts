/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable, Logger } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import type { MiMeta } from '@/models/Meta.js';

const DEFAULT_API_ORIGIN = 'https://dashscope.aliyuncs.com';
const SEARCH_TIMEOUT_MS = 10_000;
const ADD_TIMEOUT_MS = 15_000;
const LIST_TIMEOUT_MS = 15_000;
const MUTATION_TIMEOUT_MS = 15_000;

export type DashscopeMemoryNodeRow = {
	memoryNodeId: string;
	content: string;
	createdAt: number | null;
	updatedAt: number | null;
};

type ChatMessage = { role: 'user' | 'assistant'; content: string };

@Injectable()
export class AgentDashscopeMemoryService {
	private readonly logger = new Logger(AgentDashscopeMemoryService.name);

	@bindThis
	public isRunnable(meta: MiMeta): boolean {
		return meta.agentMem0Enabled === true && (meta.agentMem0ApiKey?.trim().length ?? 0) > 0;
	}

	@bindThis
	public bailianUserId(misskeyUserId: string, sessionId: string): string {
		return `${misskeyUserId}:${sessionId}`;
	}

	private apiOrigin(meta: MiMeta): string {
		const raw = meta.agentMem0ApiBaseUrl?.trim();
		if (!raw) return DEFAULT_API_ORIGIN;
		try {
			const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
			return u.origin;
		} catch {
			return DEFAULT_API_ORIGIN;
		}
	}

	/**
	 * @returns 拼接后的记忆文本（已按 maxChars 截断）；失败返回 null
	 */
	@bindThis
	public async searchMemory(params: {
		meta: MiMeta;
		bailianUserId: string;
		messages: ChatMessage[];
		topK: number;
		minScore: number | null;
		maxChars: number;
	}): Promise<string | null> {
		const key = params.meta.agentMem0ApiKey?.trim();
		if (!key) return null;
		const topK = Math.max(1, Math.min(100, Math.trunc(params.topK)));
		const origin = this.apiOrigin(params.meta);
		const url = `${origin}/api/v2/apps/memory/memory_nodes/search`;
		const body: Record<string, unknown> = {
			user_id: params.bailianUserId,
			messages: params.messages,
			top_k: topK,
		};
		const lib = params.meta.agentMem0OrgId?.trim();
		if (lib) body.memory_library_id = lib;
		if (params.minScore != null && Number.isFinite(params.minScore)) {
			body.min_score = Math.max(0, Math.min(1, params.minScore));
		}
		const ac = new AbortController();
		const t = setTimeout(() => ac.abort(), SEARCH_TIMEOUT_MS);
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${key}`,
				},
				body: JSON.stringify(body),
				signal: ac.signal,
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				this.logger.warn(`Dashscope search memory failed: ${res.status} ${txt.slice(0, 200)}`);
				return null;
			}
			const json = await res.json() as { memory_nodes?: { content?: string }[] };
			const nodes = json.memory_nodes;
			if (!Array.isArray(nodes) || nodes.length === 0) return '';
			const parts: string[] = [];
			let used = 0;
			for (const n of nodes) {
				const c = typeof n.content === 'string' ? n.content.trim() : '';
				if (!c) continue;
				if (used + c.length + 1 > params.maxChars) break;
				parts.push(c);
				used += c.length + 1;
			}
			return parts.join('\n');
		} catch (e) {
			this.logger.warn(`Dashscope search memory error: ${e instanceof Error ? e.message : String(e)}`);
			return null;
		} finally {
			clearTimeout(t);
		}
	}

	/**
	 * 从会话尾部截取最多 maxRounds 组「user → assistant」，含本轮。
	 */
	@bindThis
	public buildMessagesForAddMemory(params: {
		priorMessages: ChatMessage[];
		currentUserText: string;
		assistantText: string;
		maxRounds: number;
	}): ChatMessage[] {
		let mr = Math.trunc(Number(params.maxRounds));
		if (!Number.isFinite(mr)) mr = 3;
		const maxRounds = Math.max(1, Math.min(24, mr));
		const full: ChatMessage[] = [
			...params.priorMessages,
			{ role: 'user', content: params.currentUserText },
			{ role: 'assistant', content: params.assistantText },
		];
		const out: ChatMessage[] = [];
		let i = full.length - 1;
		let rounds = 0;
		while (i >= 1 && rounds < maxRounds) {
			const second = full[i];
			const first = full[i - 1];
			if (first.role === 'user' && second.role === 'assistant') {
				out.unshift(first, second);
				rounds++;
				i -= 2;
			} else {
				i -= 1;
			}
		}
		if (out.length === 0) {
			return [
				{ role: 'user', content: params.currentUserText },
				{ role: 'assistant', content: params.assistantText },
			];
		}
		return out;
	}

	@bindThis
	public scheduleAddMemory(params: {
		meta: MiMeta;
		bailianUserId: string;
		messages: ChatMessage[];
	}): void {
		const key = params.meta.agentMem0ApiKey?.trim();
		if (!key) return;
		if (params.messages.length === 0) return;
		const origin = this.apiOrigin(params.meta);
		const url = `${origin}/api/v2/apps/memory/add`;
		const body: Record<string, unknown> = {
			user_id: params.bailianUserId,
			messages: params.messages,
		};
		const lib = params.meta.agentMem0OrgId?.trim();
		if (lib) body.memory_library_id = lib;

		setImmediate(() => {
			void (async () => {
				const ac = new AbortController();
				const t = setTimeout(() => ac.abort(), ADD_TIMEOUT_MS);
				try {
					const res = await fetch(url, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${key}`,
						},
						body: JSON.stringify(body),
						signal: ac.signal,
					});
					const txt = await res.text().catch(() => '');
					if (!res.ok) {
						this.logger.warn(`Dashscope add memory failed: ${res.status} ${txt.slice(0, 200)}`);
						return;
					}
					let parsed: unknown;
					try {
						parsed = txt.length > 0 ? JSON.parse(txt) as unknown : null;
					} catch {
						this.logger.warn(`Dashscope add memory: non-JSON body ${txt.slice(0, 200)}`);
						return;
					}
					if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
						const o = parsed as Record<string, unknown>;
						const code = o.code;
						const hasNodes = 'memory_nodes' in o;
						if (typeof code === 'string' && code.length > 0 && !hasNodes) {
							this.logger.warn(`Dashscope add memory failed (body): ${code} ${String(o.message ?? '').slice(0, 200)}`);
						}
					}
				} catch (e) {
					this.logger.warn(`Dashscope add memory error: ${e instanceof Error ? e.message : String(e)}`);
				} finally {
					clearTimeout(t);
				}
			})();
		});
	}

	private memoryLibraryBody(meta: MiMeta): Record<string, unknown> | null {
		const lib = meta.agentMem0OrgId?.trim();
		if (!lib) return null;
		return { memory_library_id: lib };
	}

	/**
	 * 列出当前 user_id（Misskey 用户 + 会话）下的记忆节点（百炼 ListMemory）
	 */
	@bindThis
	public async listMemoryNodes(params: {
		meta: MiMeta;
		bailianUserId: string;
		pageNum: number;
		pageSize: number;
	}): Promise<{ memoryNodes: DashscopeMemoryNodeRow[]; total: number; pageNum: number; pageSize: number } | null> {
		const key = params.meta.agentMem0ApiKey?.trim();
		if (!key) return null;
		const pageNum = Math.max(1, Math.trunc(params.pageNum));
		const pageSize = Math.max(1, Math.min(50, Math.trunc(params.pageSize)));
		const origin = this.apiOrigin(params.meta);
		const q = new URLSearchParams({
			user_id: params.bailianUserId,
			page_num: String(pageNum),
			page_size: String(pageSize),
		});
		const lib = params.meta.agentMem0OrgId?.trim();
		if (lib) q.set('memory_library_id', lib);
		const url = `${origin}/api/v2/apps/memory/memory_nodes?${q.toString()}`;
		const ac = new AbortController();
		const t = setTimeout(() => ac.abort(), LIST_TIMEOUT_MS);
		try {
			const res = await fetch(url, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${key}`,
				},
				signal: ac.signal,
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				this.logger.warn(`Dashscope list memory failed: ${res.status} ${txt.slice(0, 200)}`);
				return null;
			}
			const json = await res.json() as {
				memory_nodes?: { memory_node_id?: string; content?: string; created_at?: number; updated_at?: number }[];
				total?: string | number;
				page_num?: number;
				page_size?: number;
			};
			const raw = json.memory_nodes;
			const memoryNodes: DashscopeMemoryNodeRow[] = [];
			if (Array.isArray(raw)) {
				for (const n of raw) {
					const id = typeof n.memory_node_id === 'string' ? n.memory_node_id : '';
					if (!id) continue;
					memoryNodes.push({
						memoryNodeId: id,
						content: typeof n.content === 'string' ? n.content : '',
						createdAt: typeof n.created_at === 'number' ? n.created_at : null,
						updatedAt: typeof n.updated_at === 'number' ? n.updated_at : null,
					});
				}
			}
			const totalRaw = json.total;
			const total = typeof totalRaw === 'number' ? totalRaw : (typeof totalRaw === 'string' ? Number(totalRaw) : memoryNodes.length);
			return {
				memoryNodes,
				total: Number.isFinite(total) ? total : memoryNodes.length,
				pageNum: typeof json.page_num === 'number' ? json.page_num : pageNum,
				pageSize: typeof json.page_size === 'number' ? json.page_size : pageSize,
			};
		} catch (e) {
			this.logger.warn(`Dashscope list memory error: ${e instanceof Error ? e.message : String(e)}`);
			return null;
		} finally {
			clearTimeout(t);
		}
	}

	/** 自定义内容添加记忆（同步等待百炼响应） */
	@bindThis
	public async addCustomMemory(params: {
		meta: MiMeta;
		bailianUserId: string;
		customContent: string;
	}): Promise<{ memoryNodes: { memoryNodeId: string; content: string }[] } | null> {
		const key = params.meta.agentMem0ApiKey?.trim();
		if (!key) return null;
		const origin = this.apiOrigin(params.meta);
		const url = `${origin}/api/v2/apps/memory/add`;
		const body: Record<string, unknown> = {
			user_id: params.bailianUserId,
			custom_content: params.customContent,
		};
		Object.assign(body, this.memoryLibraryBody(params.meta) ?? {});
		const ac = new AbortController();
		const t = setTimeout(() => ac.abort(), MUTATION_TIMEOUT_MS);
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${key}`,
				},
				body: JSON.stringify(body),
				signal: ac.signal,
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				this.logger.warn(`Dashscope add custom memory failed: ${res.status} ${txt.slice(0, 200)}`);
				return null;
			}
			const json = await res.json() as { memory_nodes?: { memory_node_id?: string; content?: string }[] };
			const raw = json.memory_nodes;
			const memoryNodes: { memoryNodeId: string; content: string }[] = [];
			if (Array.isArray(raw)) {
				for (const n of raw) {
					const id = typeof n.memory_node_id === 'string' ? n.memory_node_id : '';
					if (!id) continue;
					memoryNodes.push({
						memoryNodeId: id,
						content: typeof n.content === 'string' ? n.content : '',
					});
				}
			}
			return { memoryNodes };
		} catch (e) {
			this.logger.warn(`Dashscope add custom memory error: ${e instanceof Error ? e.message : String(e)}`);
			return null;
		} finally {
			clearTimeout(t);
		}
	}

	@bindThis
	public async updateMemoryNode(params: {
		meta: MiMeta;
		bailianUserId: string;
		memoryNodeId: string;
		customContent: string;
	}): Promise<boolean> {
		const key = params.meta.agentMem0ApiKey?.trim();
		if (!key) return false;
		const origin = this.apiOrigin(params.meta);
		const url = `${origin}/api/v2/apps/memory/memory_nodes/${encodeURIComponent(params.memoryNodeId)}`;
		const body: Record<string, unknown> = {
			user_id: params.bailianUserId,
			custom_content: params.customContent,
		};
		Object.assign(body, this.memoryLibraryBody(params.meta) ?? {});
		const ac = new AbortController();
		const t = setTimeout(() => ac.abort(), MUTATION_TIMEOUT_MS);
		try {
			const res = await fetch(url, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${key}`,
				},
				body: JSON.stringify(body),
				signal: ac.signal,
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				this.logger.warn(`Dashscope update memory failed: ${res.status} ${txt.slice(0, 200)}`);
				return false;
			}
			return true;
		} catch (e) {
			this.logger.warn(`Dashscope update memory error: ${e instanceof Error ? e.message : String(e)}`);
			return false;
		} finally {
			clearTimeout(t);
		}
	}

	@bindThis
	public async deleteMemoryNode(params: {
		meta: MiMeta;
		bailianUserId: string;
		memoryNodeId: string;
	}): Promise<boolean> {
		const key = params.meta.agentMem0ApiKey?.trim();
		if (!key) return false;
		const origin = this.apiOrigin(params.meta);
		const q = new URLSearchParams({ user_id: params.bailianUserId });
		const lib = params.meta.agentMem0OrgId?.trim();
		if (lib) q.set('memory_library_id', lib);
		const url = `${origin}/api/v2/apps/memory/memory_nodes/${encodeURIComponent(params.memoryNodeId)}?${q.toString()}`;
		const ac = new AbortController();
		const t = setTimeout(() => ac.abort(), MUTATION_TIMEOUT_MS);
		try {
			const res = await fetch(url, {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${key}`,
				},
				body: '{}',
				signal: ac.signal,
			});
			if (!res.ok) {
				const txt = await res.text().catch(() => '');
				this.logger.warn(`Dashscope delete memory failed: ${res.status} ${txt.slice(0, 200)}`);
				return false;
			}
			return true;
		} catch (e) {
			this.logger.warn(`Dashscope delete memory error: ${e instanceof Error ? e.message : String(e)}`);
			return false;
		} finally {
			clearTimeout(t);
		}
	}

	/**
	 * 删除百炼上该 bailianUserId（Misskey 用户 + 会话）下的全部记忆节点；用于用户删除智能体会话时的远程清理。
	 */
	@bindThis
	public async deleteAllMemoryNodesForBailianUser(params: {
		meta: MiMeta;
		bailianUserId: string;
	}): Promise<{ deleted: number; providerFailed: boolean }> {
		const key = params.meta.agentMem0ApiKey?.trim();
		if (!key) return { deleted: 0, providerFailed: false };
		let deleted = 0;
		const pageSize = 50;
		const maxRounds = 200;
		for (let round = 0; round < maxRounds; round++) {
			const list = await this.listMemoryNodes({
				meta: params.meta,
				bailianUserId: params.bailianUserId,
				pageNum: 1,
				pageSize,
			});
			if (list == null) {
				return { deleted, providerFailed: true };
			}
			if (list.memoryNodes.length === 0) {
				return { deleted, providerFailed: false };
			}
			for (const n of list.memoryNodes) {
				const ok = await this.deleteMemoryNode({
					meta: params.meta,
					bailianUserId: params.bailianUserId,
					memoryNodeId: n.memoryNodeId,
				});
				if (ok) deleted++;
			}
		}
		this.logger.warn('Dashscope deleteAllMemoryNodesForBailianUser: max rounds reached');
		return { deleted, providerFailed: true };
	}
}
