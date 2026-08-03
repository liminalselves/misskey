/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * 将 HuggingFace tokenizer.json（byte-level BPE）转换为 js-tiktoken 可加载的标准 tiktoken 词表。
 *
 * 用法：
 *   node scripts/convert-hf-tokenizer-to-tiktoken.mjs <tokenizer.json> <outPrefix>
 * 产出：
 *   <outPrefix>.tiktoken  —— 标准 tiktoken 词表，每行 `<base64(token字节)> <rank>`
 *   <outPrefix>.json      —— { "pat_str": string, "special_tokens": Record<string, number> }
 *
 * 设计要点：
 * - tiktoken 的 rank 语义是「合并优先级」（rank 越小越先合并），与 HF 的 merges 顺序一致：
 *   256 个基础字节占 rank 0..255，merges[i] 的结果占 rank 256+i，完整保留合并优先级。
 * - 计数只依赖分段结果（encode().length），基础字节的具体 rank 值不影响分段，故取字节值即可。
 * - pat_str 由 pre_tokenizer 中各 Split 正则按优先级合并为单一 alternation（js-tiktoken 仅支持单正则）。
 *   对 DeepSeek 这类多阶段 Sequence 预切分，合并正则为「极接近」的等价（真词表 + 近似预切分），
 *   计数误差可忽略；若需 100% 逐字节一致请改用 Transformers.js 运行官方分词器。
 * - 仅支持 GPT-2 字节映射的 byte-level BPE（byte_fallback=false）；遇到 <0xXX> 字节回退格式会报错退出。
 *
 * 本脚本在 Docker 构建期（native-builder 阶段）被调用，仅依赖 Node 内置模块。
 */

import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

function bytesToUnicode() {
	// GPT-2 byte_to_unicode：可打印字节直接映射，其余字节平移到 256+ 区段
	const bs = [];
	for (let b = 0x21; b <= 0x7e; b++) bs.push(b);
	for (let b = 0xa1; b <= 0xac; b++) bs.push(b);
	for (let b = 0xae; b <= 0xff; b++) bs.push(b);
	const cs = bs.slice();
	let n = 0;
	for (let b = 0; b < 256; b++) {
		if (!bs.includes(b)) {
			bs.push(b);
			cs.push(256 + n);
			n += 1;
		}
	}
	const byteToUni = new Map();
	const uniToByte = new Map();
	for (let i = 0; i < bs.length; i++) {
		byteToUni.set(bs[i], cs[i]);
		uniToByte.set(cs[i], bs[i]);
	}
	return { byteToUni, uniToByte };
}

function tokenToBytes(token, uniToByte) {
	const bytes = [];
	for (const ch of token) {
		const cp = ch.codePointAt(0);
		const b = uniToByte.get(cp);
		if (b === undefined) {
			throw new Error(`token ${JSON.stringify(token)} 含非 byte_to_unicode 字符 U+${cp.toString(16)}（可能是 byte_fallback 格式，暂不支持）`);
		}
		bytes.push(b);
	}
	return Buffer.from(bytes);
}

/** 从 pre_tokenizer 递归收集各 Split 正则，按优先级合并为单一 alternation 正则 */
function extractPatStr(preTokenizer) {
	const regexes = [];
	const walk = (pt) => {
		if (pt == null || typeof pt !== 'object') return;
		if (pt.type === 'Sequence' && Array.isArray(pt.pretokenizers)) {
			for (const sub of pt.pretokenizers) walk(sub);
			return;
		}
		const rx = pt.pattern && typeof pt.pattern.Regex === 'string' ? pt.pattern.Regex : null;
		if (rx != null && (pt.type === 'Split' || pt.type === 'Regex')) {
			regexes.push(rx);
		}
		// ByteLevel / MetaSpace 等不做正则切分，忽略
	};
	walk(preTokenizer);
	if (regexes.length === 0) return null;
	return regexes.map((r) => `(?:${r})`).join('|');
}

function main() {
	const [, , inputArg, outPrefixArg] = process.argv;
	if (!inputArg || !outPrefixArg) {
		console.error('用法: node scripts/convert-hf-tokenizer-to-tiktoken.mjs <tokenizer.json> <outPrefix>');
		process.exit(1);
	}
	const raw = fs.readFileSync(inputArg, 'utf8');
	const json = JSON.parse(raw);
	const model = json.model;
	if (!model || model.type !== 'BPE') {
		throw new Error(`不支持的 model.type: ${model && model.type}（仅支持 BPE）`);
	}
	if (model.byte_fallback === true) {
		throw new Error('byte_fallback=true 的 BPE（<0xXX> 字节回退）暂不支持');
	}
	if (!Array.isArray(model.merges) || model.merges.length === 0) {
		throw new Error('model.merges 缺失或为空');
	}

	const { uniToByte } = bytesToUnicode();

	// key: latin1 字符串（逐字节）；value: rank
	const ranks = new Map();
	// 基础字节：rank 取字节值（0..255），仅作占位，不影响分段优先级
	for (let b = 0; b < 256; b++) {
		ranks.set(String.fromCharCode(b), b);
	}
	// merges：rank = 256 + 顺序索引，完整保留合并优先级
	let skipped = 0;
	for (let i = 0; i < model.merges.length; i++) {
		const parts = String(model.merges[i]).split(' ');
		if (parts.length !== 2) {
			skipped += 1;
			continue;
		}
		const key = Buffer.concat([tokenToBytes(parts[0], uniToByte), tokenToBytes(parts[1], uniToByte)]).toString('binary');
		ranks.set(key, 256 + i);
	}

	// 特殊 token（added_tokens 中 special=true）
	const specialTokens = {};
	for (const t of Array.isArray(json.added_tokens) ? json.added_tokens : []) {
		if (t && t.special === true && typeof t.content === 'string' && Number.isInteger(t.id)) {
			specialTokens[t.content] = t.id;
		}
	}

	const patStr = extractPatStr(json.pre_tokenizer);
	if (!patStr) {
		throw new Error('未能从 pre_tokenizer 提取到任何 Split 正则');
	}

	// 按 rank 排序输出，保证结果确定性
	const entries = [...ranks.entries()].sort((a, b) => a[1] - b[1]);
	const lines = entries.map(([key, rank]) => `${Buffer.from(key, 'binary').toString('base64')} ${rank}`);
	const tiktokenText = lines.join('\n') + '\n';

	const outTiktoken = `${outPrefixArg}.tiktoken`;
	const outJson = `${outPrefixArg}.json`;
	fs.writeFileSync(outTiktoken, tiktokenText, 'utf8');
	fs.writeFileSync(outJson, JSON.stringify({ pat_str: patStr, special_tokens: specialTokens }, null, 2), 'utf8');

	const sha = crypto.createHash('sha256').update(tiktokenText, 'utf8').digest('hex');
	const vocabSize = Object.keys(model.vocab ?? {}).length;
	console.log(`[convert-hf-tokenizer] OK`);
	console.log(`  input        : ${inputArg}`);
	console.log(`  vocab        : ${vocabSize}（HF）/ ${entries.length}（tiktoken 条目）`);
	console.log(`  merges       : ${model.merges.length}（跳过 ${skipped}）`);
	console.log(`  special_tokens: ${Object.keys(specialTokens).length}`);
	console.log(`  pat_str      : ${patStr}`);
	console.log(`  output       : ${outTiktoken} , ${outJson}`);
	console.log(`  sha256(.tiktoken): ${sha}`);
}

main();
