/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * LLM 上游错误详情的脱敏与安全提取。
 * 这些文本会经 ApiError.info 返回给终端用户：官方模型的上游可能回显管理员配置的密钥，
 * 因此脱敏必须是"宁可过度、不可漏过"的方向。
 */

/** 脱敏上游错误详情：剥离凭据/密钥、压缩空白、截断长度，供 ApiError.info 返回前端辅助诊断 */
export function sanitizeLlmErrorDetail(raw: unknown): string {
	let s = raw instanceof Error ? (raw.message || raw.name) : String(raw ?? '');
	s = s.replace(/Bearer\s+[A-Za-z0-9_\-.=+\/]+/gi, 'Bearer [REDACTED]');
	s = s.replace(/(?:api[\s_-]?key|apikey|token|secret|password|credential)["']?\s*(?:provided\s*)?[:=]\s*["']?[A-Za-z0-9_\-.]{8,}/gi, '[REDACTED]');
	s = s.replace(/\b(?:sk|ak|pk|gl|rk|xai)-[A-Za-z0-9_\-]{10,}/g, '[REDACTED]');
	// 宽松兜底：密钥值紧跟在敏感词后（允许中间隔一个普通小写词与冒号），覆盖非标准前缀的回显句式；
	// 宁可过度脱敏（"token availability" 会变为 "token [REDACTED]"），不放过漏网密钥
	s = s.replace(/\b(key|token|secret|password)\b(?:\s+[a-z]+)?\s*[:=]\s*["']?[A-Za-z0-9_\-.=+\/]{8,}/gi, '$1 [REDACTED]');
	s = s.replace(/\b(key|token|secret|password)\b[^A-Za-z0-9]{0,3}[A-Za-z0-9_\-.=+\/]{8,}/gi, '$1 [REDACTED]');
	s = s.replace(/\s+/g, ' ').trim();
	return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

/**
 * 官方模型上游错误体的用户侧安全摘要：
 * 只提取 JSON 错误结构中的已知字段（error.message/error.code/message/detail），
 * 其余内容（echo 的请求体、响应头字段等密钥常见回显位置）一律丢弃；
 * 提取结果仍要过 sanitizeLlmErrorDetail 的模式脱敏与截断。
 */
export function extractSafeUpstreamErrorDetail(raw: string): string {
	let detail = '';
	if (raw.trim() !== '') {
		try {
			const body = JSON.parse(raw) as { error?: { message?: unknown; code?: unknown }; message?: unknown; detail?: unknown };
			const message = body.error?.message ?? body.message ?? body.detail;
			if (typeof message === 'string') detail = message;
			const providerCode = body.error?.code;
			if (typeof providerCode === 'string' && providerCode.trim() !== '') {
				detail = detail === '' ? providerCode : `${providerCode}: ${detail}`;
			}
		} catch {
			// 非 JSON 错误体（纯文本/HTML 错误页）：退回原文进入脱敏截断通道
			detail = raw;
		}
	}
	return sanitizeLlmErrorDetail(detail);
}
