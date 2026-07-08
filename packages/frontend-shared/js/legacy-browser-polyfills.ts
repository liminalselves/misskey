/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

function installArrayAt(): void {
	if (typeof Array.prototype.at === 'function') return;

	Object.defineProperty(Array.prototype, 'at', {
		value(index: number): unknown {
			const length = this.length >>> 0;
			const relativeIndex = Math.trunc(index) || 0;
			const absoluteIndex = relativeIndex < 0 ? length + relativeIndex : relativeIndex;
			if (absoluteIndex < 0 || absoluteIndex >= length) return undefined;
			return this[absoluteIndex];
		},
		writable: true,
		configurable: true,
	});
}

function installFindLast(): void {
	if (typeof Array.prototype.findLast === 'function') return;

	Object.defineProperty(Array.prototype, 'findLast', {
		value<T>(predicate: (value: T, index: number, array: T[]) => boolean, thisArg?: unknown): T | undefined {
			if (this == null) throw new TypeError('Array.prototype.findLast called on null or undefined');
			if (typeof predicate !== 'function') throw new TypeError('predicate must be a function');

			const array = Object(this) as T[];
			const length = array.length >>> 0;
			for (let index = length - 1; index >= 0; index--) {
				const value = array[index]!;
				if (predicate.call(thisArg, value, index, array)) return value;
			}
			return undefined;
		},
		writable: true,
		configurable: true,
	});
}

function installObjectHasOwn(): void {
	if (typeof Object.hasOwn === 'function') return;

	Object.defineProperty(Object, 'hasOwn', {
		value(object: object, property: PropertyKey): boolean {
			return Object.prototype.hasOwnProperty.call(Object(object), property);
		},
		writable: true,
		configurable: true,
	});
}

function installStructuredClone(): void {
	if (typeof globalThis.structuredClone === 'function') return;

	globalThis.structuredClone = function structuredClone<T>(value: T): T {
		if (value == null || typeof value !== 'object') return value;
		return JSON.parse(JSON.stringify(value)) as T;
	};
}

function installStringReplaceAll(): void {
	if (typeof String.prototype.replaceAll === 'function') return;

	Object.defineProperty(String.prototype, 'replaceAll', {
		value(searchValue: string | RegExp, replaceValue: string): string {
			if (searchValue instanceof RegExp) {
				if (!searchValue.global) throw new TypeError('String.prototype.replaceAll called with a non-global RegExp argument');
				return this.replace(searchValue, replaceValue);
			}
			return this.split(String(searchValue)).join(replaceValue);
		},
		writable: true,
		configurable: true,
	});
}

installArrayAt();
installFindLast();
installObjectHasOwn();
installStructuredClone();
installStringReplaceAll();
