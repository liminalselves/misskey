/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** 管理员「丢失文件」列表的纯函数：批量结果汇总、行就地更新、文案。 */

export type MissingBatchResult = 'deleted' | 'present' | 'missing' | 'unknown' | 'gone';
export type MissingBatchItem = { id: string; result: MissingBatchResult };
export type MissingBatchResponse = { aborted: boolean; items: MissingBatchItem[] };

/** 这些结果意味着该记录已不再需要审查，应从列表移除。 */
export function isResolvedResult(result: MissingBatchResult): boolean {
	return result === 'deleted' || result === 'present' || result === 'gone';
}

export function resolvedIds(response: MissingBatchResponse): string[] {
	return response.items.filter(i => isResolvedResult(i.result)).map(i => i.id);
}

/**
 * 把批量结果汇总成一句话。aborted 时明确告知「没有动任何数据」，
 * 避免管理员把「对象存储不可用」误读成「文件都没问题」。
 */
export function summarizeBatch(response: MissingBatchResponse, action: 'delete' | 'recheck'): string {
	if (response.aborted) return '对象存储当前无法连通或凭证异常，本次未做任何改动，请稍后重试。';

	const count = (r: MissingBatchResult) => response.items.filter(i => i.result === r).length;
	const parts: string[] = [];
	if (action === 'delete' && count('deleted') > 0) parts.push(`已删除 ${count('deleted')} 个`);
	if (count('present') > 0) parts.push(`${count('present')} 个对象已恢复，已移出列表`);
	if (action === 'recheck' && count('missing') > 0) parts.push(`${count('missing')} 个仍然缺失`);
	if (count('gone') > 0) parts.push(`${count('gone')} 个记录已不存在`);
	if (count('unknown') > 0) parts.push(`${count('unknown')} 个无法确认，未做改动`);
	return parts.length > 0 ? parts.join('，') : '没有需要处理的记录';
}

export function scopeLabel(scope: string): string {
	return scope === 'legacy' ? '旧桶' : '当前桶';
}

export function formatFileSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '-';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 删除前确认框的正文：说清数量与后果。 */
export function buildDeleteConfirmText(count: number): string {
	return `将再次向对象存储核实后，删除选中的 ${count} 个文件记录。对象确实缺失的才会被删除，引用处会显示「已被清理」占位，属主会收到通知。此操作不可撤销。`;
}

/** 删除一页之后若当前页已空，回退一页，避免停在空白页。 */
export function pageAfterRemoval(page: number, remainingOnPage: number): number {
	return remainingOnPage === 0 && page > 1 ? page - 1 : page;
}
