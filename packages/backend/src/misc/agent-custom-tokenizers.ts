/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Tiktoken } from 'js-tiktoken';

/**
 * 拥有「真本地分词器」的自定义模型系列。
 * 这些系列的原生分词器词表可在构建期预置进镜像（见 Dockerfile）或放入本地 data/tokenizers，
 * 由本模块以 js-tiktoken 自定义 BPE 方式精确加载。
 */
export const CUSTOM_TOKENIZER_FAMILIES = ['glm', 'deepseek'] as const;
export type CustomTokenizerFamily = typeof CUSTOM_TOKENIZER_FAMILIES[number];

/**
 * GLM-4 系列预切分正则（与 cl100k_base 完全一致）。
 * 来源：THUDM/glm-4-9b-chat 的 tokenization_chatglm.py —— GLM-4 底层即 tiktoken，
 * 仅词表为中文优化的自定义 BPE，special_tokens 传空对象。
 */
export const GLM_DEFAULT_PAT_STR = "(?i:'s|'t|'re|'ve|'m|'ll|'d)|[^\\r\\n\\p{L}\\p{N}]?\\p{L}+|\\p{N}{1,3}| ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*|\\s*[\\r\\n]+|\\s+(?!\\S)|\\s+";

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

/** 向上查找仓库根目录（与 config.ts 一致：找到含 packages/ 的目录）；找不到返回 null */
function findRepoRoot(): string | null {
	let dir = _dirname;
	for (let i = 0; i < 16; i++) {
		if (fs.existsSync(path.resolve(dir, 'packages'))) return dir;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

/**
 * 词表文件候选目录（按优先级逐一探测，命中即用）：
 * 1. 环境变量 `MISSKEY_AGENT_TOKENIZER_DIR`（显式覆盖）；
 * 2. `/tmp/agent_tokenizers`（Docker 镜像构建期注入，与 Gemini 词表缓存同思路，供生产离线使用）；
 * 3. `<repoRoot>/data/tokenizers`（本地开发；该目录已被 .gitignore 忽略）。
 */
export function resolveTokenizerDirs(): string[] {
	const dirs: string[] = [];
	const env = process.env.MISSKEY_AGENT_TOKENIZER_DIR;
	if (env && env.trim().length > 0) dirs.push(env.trim());
	dirs.push('/tmp/agent_tokenizers');
	const root = findRepoRoot();
	if (root) dirs.push(path.resolve(root, 'data', 'tokenizers'));
	return [...new Set(dirs)];
}

function findFamilyFile(family: CustomTokenizerFamily, ext: string): string | null {
	for (const dir of resolveTokenizerDirs()) {
		const p = path.join(dir, `${family}${ext}`);
		try {
			if (fs.existsSync(p)) return p;
		} catch {
			// 忽略不可读目录，继续探测下一候选
		}
	}
	return null;
}

/**
 * 将标准 tiktoken 词表文本（每行 `<base64(token字节)> <rank>`，即 GLM tokenizer.model /
 * 转换脚本产出的格式）转换为 js-tiktoken 的 bpe_ranks 字符串。
 *
 * js-tiktoken 逐行按 `[忽略字段, offset, ...tokens]` 解析，rank = offset + 索引，
 * 故此处把每行改写为 `x <rank> <base64>`（一行一个 token，offset 即其 rank）。
 * 非法行（缺字段 / rank 非整数）被跳过，保证对脏数据健壮。
 */
function toJsTiktokenBpeRanks(standardVocab: string): string {
	const out: string[] = [];
	for (const rawLine of standardVocab.split('\n')) {
		const line = rawLine.trim();
		if (!line) continue;
		const sp = line.lastIndexOf(' ');
		if (sp <= 0) continue;
		const b64 = line.slice(0, sp).trim();
		const rank = line.slice(sp + 1).trim();
		if (!b64 || !/^\d+$/.test(rank)) continue;
		out.push(`x ${rank} ${b64}`);
	}
	return out.join('\n');
}

export interface CustomTokenizerMeta {
	family: CustomTokenizerFamily;
	/** 实际加载的词表文件路径（用于日志与诊断） */
	sourcePath: string;
	tokenizer: Tiktoken;
}

/**
 * 同步加载某系列的真分词器；词表缺失或损坏时返回 null（调用方回退兼容近似编码）。
 *
 * 文件约定（位于 {@link resolveTokenizerDirs} 任一候选目录）：
 * - `<family>.tiktoken`：标准 tiktoken 词表（每行 `<base64> <rank>`）。GLM 可直接使用官方 tokenizer.model；
 *   DeepSeek 由 scripts/convert-hf-tokenizer-to-tiktoken.mjs 从 HF tokenizer.json 转换生成。
 * - `<family>.json`（可选）：`{ "pat_str"?: string, "special_tokens"?: Record<string, number> }`。
 *   缺省 pat_str 使用 {@link fallbackPatStr}，special_tokens 缺省为空。
 *
 * @param family 系列
 * @param fallbackPatStr 侧车配置未提供 pat_str 时的默认预切分正则（GLM 传 {@link GLM_DEFAULT_PAT_STR}）
 */
export function loadCustomTiktokenTokenizer(family: CustomTokenizerFamily, fallbackPatStr: string): CustomTokenizerMeta | null {
	const vocabPath = findFamilyFile(family, '.tiktoken');
	if (!vocabPath) return null;
	try {
		const standard = fs.readFileSync(vocabPath, 'utf8');
		const bpeRanks = toJsTiktokenBpeRanks(standard);
		if (!bpeRanks) return null;
		let patStr = fallbackPatStr;
		let specialTokens: Record<string, number> = {};
		const metaPath = findFamilyFile(family, '.json');
		if (metaPath) {
			const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { pat_str?: unknown; special_tokens?: unknown };
			if (typeof meta.pat_str === 'string' && meta.pat_str.length > 0) patStr = meta.pat_str;
			if (meta.special_tokens && typeof meta.special_tokens === 'object') {
				specialTokens = meta.special_tokens as Record<string, number>;
			}
		}
		const tokenizer = new Tiktoken({ pat_str: patStr, special_tokens: specialTokens, bpe_ranks: bpeRanks });
		return { family, sourcePath: vocabPath, tokenizer };
	} catch {
		return null;
	}
}

/**
 * 词表可用性检查结果
 */
export interface TokenizerVocabStatus {
	family: CustomTokenizerFamily;
	/** 词表是否可用 */
	available: boolean;
	/** 词表文件路径（如果可用） */
	vocabPath?: string;
	/** 配置文件路径（如果可用） */
	configPath?: string;
}

/**
 * 检查所有自定义分词器系列的词表可用性。
 * 用于管理后台显示告警信息。
 */
export function checkTokenizerVocabStatus(): TokenizerVocabStatus[] {
	return CUSTOM_TOKENIZER_FAMILIES.map(family => {
		const vocabPath = findFamilyFile(family, '.tiktoken');
		const configPath = findFamilyFile(family, '.json');
		return {
			family,
			available: vocabPath != null,
			vocabPath: vocabPath ?? undefined,
			configPath: configPath ?? undefined,
		};
	});
}
