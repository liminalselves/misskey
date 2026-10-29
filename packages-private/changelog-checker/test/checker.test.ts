/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, describe, test } from 'vitest';
import { Release, ReleaseCategory } from '../src/parser.js';
import { checkNewRelease, checkNewTopic, checkRetractedRelease } from '../src/checker.js';

describe('checkNewRelease', () => {
	test('retains the fork unreleased section while importing upstream releases', () => {
		const published = new Release('2025.12.2-liminalselves.4', [new ReleaseCategory('Fixes', ['preserved'])]);
		const base = [new Release('unreleased'), published, new Release('2025.12.2')];
		const head = [new Release('unreleased', [new ReleaseCategory('General', ['sync'])]), new Release('2026.10.0'), published, new Release('2025.12.2')];
		expect(checkNewRelease(base, head).success).toBe(true);
	});

	test('rejects changed published entries even when new releases are added', () => {
		const base = [new Release('unreleased'), new Release('fork.4', [new ReleaseCategory('Fixes', ['original'])])];
		const head = [new Release('unreleased'), new Release('upstream'), new Release('fork.4', [new ReleaseCategory('Fixes', ['changed'])])];
		expect(checkNewRelease(base, head).success).toBe(false);
	});

	test.each(['unreleased', 'Unreleased'])('accepts a new release below the retained %s section', (name) => {
		const base = [new Release(name), new Release('2025.12.2-liminalselves.4')];
		const head = [new Release(name), new Release('2025.12.2-liminalselves.5'), new Release('2025.12.2-liminalselves.4')];

		expect(checkNewRelease(base, head).success).toBe(true);
	});

	test('still rejects replacing the previous release below unreleased', () => {
		const base = [new Release('unreleased'), new Release('2025.12.2-liminalselves.4')];
		const head = [new Release('unreleased'), new Release('2025.12.2-liminalselves.5'), new Release('2025.12.2-liminalselves.3')];

		expect(checkNewRelease(base, head).success).toBe(false);
	});

	test('does not count adding only an unreleased heading as a release', () => {
		const base = [new Release('2025.12.2-liminalselves.4')];
		const head = [new Release('unreleased'), new Release('2025.12.2-liminalselves.4')];

		expect(checkNewRelease(base, head).success).toBe(false);
	});

	test('headに新しいリリースがある1', () => {
		const base = [new Release('2024.12.0')];
		const head = [new Release('2024.12.1'), new Release('2024.12.0')];

		const result = checkNewRelease(base, head);

		expect(result.success).toBe(true);
	});

	test('headに新しいリリースがある2', () => {
		const base = [new Release('2024.12.0')];
		const head = [new Release('2024.12.2'), new Release('2024.12.1'), new Release('2024.12.0')];

		const result = checkNewRelease(base, head);

		expect(result.success).toBe(true);
	});

	test('リリースの数が同じ', () => {
		const base = [new Release('2024.12.0')];
		const head = [new Release('2024.12.0')];

		const result = checkNewRelease(base, head);

		console.log(result.message);
		expect(result.success).toBe(false);
	});

	test('baseにあるリリースがheadにない', () => {
		const base = [new Release('2024.12.0')];
		const head = [new Release('2024.12.2'), new Release('2024.12.1')];

		const result = checkNewRelease(base, head);

		console.log(result.message);
		expect(result.success).toBe(false);
	});

	// 先頭だけ比較していると、より古いリリースの書き換えを見逃す
	test('追加分の直後は一致しているが、より古いリリースが書き換えられている', () => {
		const base = [new Release('2024.12.1'), new Release('2024.12.0')];
		const head = [new Release('2024.12.2'), new Release('2024.12.1'), new Release('2024.11.0')];

		const result = checkNewRelease(base, head);

		console.log(result.message);
		expect(result.success).toBe(false);
	});
});

describe('checkRetractedRelease', () => {
	test('accepts retracting the newest release', () => {
		const base = [new Release('unreleased'), new Release('2025.12.2-liminalselves.6'), new Release('2025.12.2-liminalselves.5')];
		const head = [new Release('unreleased'), new Release('2025.12.2-liminalselves.5')];

		expect(checkRetractedRelease(base, head).success).toBe(true);
	});

	test('rejects retraction when the remaining release does not match', () => {
		const base = [new Release('2025.12.2-liminalselves.6'), new Release('2025.12.2-liminalselves.5')];
		const head = [new Release('2025.12.2-liminalselves.4')];

		expect(checkRetractedRelease(base, head).success).toBe(false);
	});
});

describe('checkNewTopic', () => {
	test('追記なし', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
				new ReleaseCategory('Client', [
					'feat3',
					'feat4',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
				new ReleaseCategory('Client', [
					'feat3',
					'feat4',
				]),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
				new ReleaseCategory('Client', [
					'feat3',
					'feat4',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
				new ReleaseCategory('Client', [
					'feat3',
					'feat4',
				]),
			]),
		];

		const result = checkNewTopic(base, head);

		expect(result.success).toBe(true);
	});

	test('最新バージョンにカテゴリを追加したときはエラーにならない', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
				new ReleaseCategory('Client', [
					'feat3',
					'feat4',
				]),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
				new ReleaseCategory('Client', [
					'feat3',
					'feat4',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
				new ReleaseCategory('Client', [
					'feat3',
					'feat4',
				]),
			]),
		];

		const result = checkNewTopic(base, head);

		expect(result.success).toBe(true);
	});

	test('最新バージョンからカテゴリを削除したときはエラーにならない', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
				new ReleaseCategory('Client', [
					'feat3',
					'feat4',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
				new ReleaseCategory('Client', [
					'feat3',
					'feat4',
				]),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
				new ReleaseCategory('Client', [
					'feat3',
					'feat4',
				]),
			]),
		];

		const result = checkNewTopic(base, head);

		expect(result.success).toBe(true);
	});

	test('最新バージョンに追記したときはエラーにならない', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
					'feat3',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
		];

		const result = checkNewTopic(base, head);

		expect(result.success).toBe(true);
	});

	test('最新バージョンから削除したときはエラーにならない', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
		];

		const result = checkNewTopic(base, head);

		expect(result.success).toBe(true);
	});

	test('古いバージョンにカテゴリを追加したときはエラーになる', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
				new ReleaseCategory('Client', [
					'feat1',
					'feat2',
				]),
			]),
		];

		const result = checkNewTopic(base, head);

		console.log(result.message);
		expect(result.success).toBe(false);
	});

	test('古いバージョンからカテゴリを削除したときはエラーになる', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
			]),
		];

		const result = checkNewTopic(base, head);

		console.log(result.message);
		expect(result.success).toBe(false);
	});

	test('古いバージョンに追記したときはエラーになる', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
					'feat3',
				]),
			]),
		];

		const result = checkNewTopic(base, head);

		console.log(result.message);
		expect(result.success).toBe(false);
	});

	test('古いバージョンから削除したときはエラーになる', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', [
					'feat1',
					'feat2',
				]),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', [
					'feat1',
				]),
			]),
		];

		const result = checkNewTopic(base, head);

		console.log(result.message);
		expect(result.success).toBe(false);
	});

	// 件数が同じでも内容が変わっていれば履歴の書き換えなのでエラーにする
	test('古いバージョンの項目が書き換えられたときはエラーになる', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', ['feat1']),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', ['feat1', 'feat2']),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', ['feat1']),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', ['feat1', 'feat2-rewritten']),
			]),
		];

		const result = checkNewTopic(base, head);

		console.log(result.message);
		expect(result.success).toBe(false);
	});

	test('古いバージョンの項目が並べ替えられたときはエラーになる', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', ['feat1']),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', ['feat1', 'feat2']),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', ['feat1']),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', ['feat2', 'feat1']),
			]),
		];

		const result = checkNewTopic(base, head);

		console.log(result.message);
		expect(result.success).toBe(false);
	});

	// 最新リリースの書き換えは通常の編集なので許容する
	test('最新バージョンの項目を書き換えたときはエラーにならない', () => {
		const base = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', ['feat1']),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', ['feat1']),
			]),
		];

		const head = [
			new Release('2024.12.1', [
				new ReleaseCategory('Server', ['feat1-rewritten']),
			]),
			new Release('2024.12.0', [
				new ReleaseCategory('Server', ['feat1']),
			]),
		];

		const result = checkNewTopic(base, head);

		expect(result.success).toBe(true);
	});
});
