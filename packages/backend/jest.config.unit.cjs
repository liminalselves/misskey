/*
* For a detailed explanation regarding each configuration property and type check, visit:
* https://jestjs.io/docs/en/configuration.html
*/

const base = require('./jest.config.cjs')

module.exports = {
	...base,
	globalSetup: "<rootDir>/test/jest.setup.unit.cjs",
	testMatch: [
		"<rootDir>/test/unit/**/*.ts",
		"<rootDir>/src/**/*.test.ts",
	],
	// バックエンドの依存には ESM-only（node-fetch / nanoid / chalk / got 等）が多数あり、
	// CJS モードの jest では require できない。ユニットテストはこれらの実本体に依存しない
	// 純粋ロジックのみを対象とするため、共通スタブへ解決させる。
	moduleNameMapper: {
		...base.moduleNameMapper,
		'^(node-fetch|nanoid|chalk|cacheable-lookup|@misskey-dev/sharp-read-bmp|got|chokidar|file-type|fluent-ffmpeg|is-svg|probe-image-size|blurhash)$': '<rootDir>/test/fixtures/esm-cjs-stub.js',
		// logger.ts が実行時 import する color-convert（v3・ESM-only）のスタブ。
		// マッパーは発行元を区別しないため color@4 経由の要求も空スタブになるが、
		// color@4 はロード時にキー列挙をするだけで、空オブジェクトなら何も起きない。
		'^color-convert(?:/conversions\\.js)?$': '<rootDir>/test/fixtures/empty-stub.js',
	},
};
