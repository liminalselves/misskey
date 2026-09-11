/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// color-convert 用の空スタブ。color@4 はロード時に Object.keys(convert) を列挙して
// 色空間を登録するため、空オブジェクトなら何も登録せず正常にロードを完走する。
// ログの色付き出力（convertColor.keyword.rgb）のみがこの実体を必要とするが、
// ユニットテストはログ内容を検証しない。
module.exports = {};
