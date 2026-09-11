/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 若干の依存パッケージ（node-fetch / nanoid / chalk など）は ESM-only だが、
// jest を CJS モードで動かしているためそのままでは require できない。
// jest.config.unit.cjs の moduleNameMapper 経由でこのスタブに解決させる。
// ユニットテストは純粋ロジックのみを対象とし、これらの実本体に依存しない。
// なお ESM 形式で import される経路もあるため、各エクスポートは cjs-module-lexer が
// 検出できる `exports.x =` の個別代入形式にする（オブジェクトリテラル一括代入は
// new Proxy が含まれると途中で解析打ち切りになり具名エクスポートが欠ける）。

const proxyDefault = new Proxy({}, { get: () => () => 'x' });
const customAlphabet = () => () => 'test';
const nanoid = () => 'test';
class CacheableLookup {
	lookup() {}
}
class FSWatcher {
	on() { return this; }
	close() { return Promise.resolve(); }
}
const watch = () => new FSWatcher();
const fileTypeFromBuffer = async () => undefined;
const fileTypeFromFile = async () => undefined;
const isSvg = () => false;
const probeImageSize = () => { throw new Error('stub'); };
const encode = () => '';
const decode = () => new Uint8ClampedArray(0);
const sharpBmp = () => { throw new Error('stub'); };

exports.__esModule = true;
exports.default = proxyDefault;
exports.customAlphabet = customAlphabet;
exports.nanoid = nanoid;
exports.CacheableLookup = CacheableLookup;
exports.FSWatcher = FSWatcher;
exports.watch = watch;
exports.fileTypeFromBuffer = fileTypeFromBuffer;
exports.fileTypeFromFile = fileTypeFromFile;
exports.isSvg = isSvg;
exports.probeImageSize = probeImageSize;
exports.encode = encode;
exports.decode = decode;
exports.sharpBmp = sharpBmp;
