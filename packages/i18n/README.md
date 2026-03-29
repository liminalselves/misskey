# Misskey i18n

Misskey の言語ファイル本体 (ja-JP.yml など) はリポジトリ直下の `/locales` に置かれており、そこから Crowdin 連携やビルド資産が生成されます。

このパッケージは Misskey モノレポ内で、これらの言語ファイルを共通で扱うためのヘルパー群や型情報をまとめる位置づけです。バックエンド / フロントエンド / Service Worker など各パッケージが同じ翻訳データと型定義を利用できるようにすることを目的としており、npm での外部配布は想定していません。

## ロケールキー追加後（開発者向け）

`/locales` の YAML にキーを追加したら、リポジトリルートで次を実行し、`src/autogen/locale.ts` を再生成してください。

```bash
pnpm --filter i18n generate
pnpm --filter i18n build
```

Windows では、`scripts/generateLocaleInterface.ts` のエントリ判定を `fileURLToPath` と `path.resolve` で行う修正済み（`import.meta.url` と `process.argv[1]` の直比較は Windows で一致しないことがあるため）。
