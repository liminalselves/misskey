/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

export type RequestLogItem = {
	failed: boolean;
	url: string;
	name: string;
	error?: string;
};

export const gridSortOrderKeys = [
	'name',
	'category',
	'aliases',
	'type',
	'license',
	'host',
	'uri',
	'publicUrl',
	'isSensitive',
	'localOnly',
	'updatedAt',
] as const satisfies string[];

export type GridSortOrderKey = typeof gridSortOrderKeys[number];

export function gridColumnTitle(key: GridSortOrderKey): string {
	const t = i18n.ts._customEmojisManager._gridCommon;
	switch (key) {
		case 'name': return t.columnName;
		case 'category': return t.columnCategory;
		case 'aliases': return t.columnAliases;
		case 'type': return t.columnType;
		case 'license': return t.columnLicense;
		case 'host': return t.columnHost;
		case 'uri': return t.columnUri;
		case 'publicUrl': return t.columnPublicUrl;
		case 'isSensitive': return t.columnSensitive;
		case 'localOnly': return t.columnLocalOnly;
		case 'updatedAt': return t.columnUpdatedAt;
	}
}

export function emptyStrToUndefined(value: string | null) {
	return value ? value : undefined;
}

export function emptyStrToNull(value: string) {
	return value === '' ? null : value;
}

export function emptyStrToEmptyArray(value: string) {
	return value === '' ? [] : value.split(' ').map(it => it.trim());
}

export function roleIdsParser(text: string): { id: string, name: string }[] {
	// idとnameのペア配列をJSONで受け取る。それ以外の形式は許容しない
	try {
		const obj = JSON.parse(text);
		if (!Array.isArray(obj)) {
			return [];
		}
		if (!obj.every(it => typeof it === 'object' && 'id' in it && 'name' in it)) {
			return [];
		}

		return obj.map(it => ({ id: it.id, name: it.name }));
	} catch (ex) {
		console.warn(ex);
		return [];
	}
}
