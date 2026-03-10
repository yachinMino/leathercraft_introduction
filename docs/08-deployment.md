# アプリケーションデプロイ手順

## 目的

このドキュメントは、本アプリケーションを Cloudflare 上に本番デプロイするための手順をまとめたものです。

対象:

- フロントエンド: React + Vite
- アプリケーション実行基盤: Cloudflare Workers
- データベース: Cloudflare D1
- 画像ストレージ: Cloudflare R2

このドキュメントには、パスワードやシークレットの実値は記載しません。

## 前提条件

以下を満たしていることを前提とします。

- Cloudflare アカウントを保有している
- `Node.js` と `npm` が利用できる
- プロジェクトの依存関係がインストール済みである
- `wrangler` を実行できる

初回のみ、Cloudflare にログインします。

```bash
npx wrangler login
```

## 1. 依存関係をインストールする

未実施の場合は、プロジェクトルートで以下を実行します。

```bash
npm install
```

## 2. Cloudflare リソースを作成する

### D1 を作成する

```bash
npx wrangler d1 create leathercraft-db
```

実行結果に表示される `database_id` は後で `wrangler.jsonc` に設定します。

### R2 バケットを作成する

```bash
npx wrangler r2 bucket create leathercraft-work-images
```

別名を使いたい場合は、作成したバケット名に合わせて `wrangler.jsonc` を変更します。

## 3. `wrangler.jsonc` を設定する

[wrangler.jsonc](/e:/reposities/leathercraft_introduction/wrangler.jsonc) の D1 / R2 設定を、Cloudflare 上で作成したリソースに合わせます。

確認ポイント:

- `d1_databases[].database_id`
- `d1_databases[].preview_database_id`
- `r2_buckets[].bucket_name`
- `r2_buckets[].preview_bucket_name`

`preview_database_id` を別環境で分けない場合は、本番と同じ D1 ID を設定しても構いません。

## 4. 本番用 Secret を設定する

本番では `.dev.vars` を使いません。管理画面ログインとセッション署名に使う値は Cloudflare Secret に登録します。

### 管理者パスワード

```bash
npx wrangler secret put ADMIN_PASSWORD
```

入力値の注意:

- 50 文字以内
- 推測しやすい文字列を避ける
- 他サービスと使い回さない

### セッションシークレット

```bash
npx wrangler secret put SESSION_SECRET
```

入力値の注意:

- 長く、ランダムな文字列を使う
- 管理者パスワードとは別の値にする
- 漏えいした場合は再発行する

補足:

- Secret は登録後に値を読み出せません
- 値が不明になった場合は再設定します

## 5. 本番データベースへマイグレーションを適用する

本番デプロイ前に D1 へマイグレーションを適用します。

```bash
npm run db:migrate:remote
```

反映確認:

```bash
npx wrangler d1 migrations list leathercraft-db --remote
```

## 6. デプロイ前チェックを行う

以下を実行し、失敗がないことを確認します。

```bash
npm test
npm run lint
npm run build
```

## 7. アプリケーションをデプロイする

```bash
npm run deploy
```

デプロイ後、Workers の公開 URL で画面表示を確認します。

## 8. デプロイ後の確認

最低限、以下を確認します。

- 作品一覧ページが開く
- 作品詳細ページが開く
- 管理画面ログインができる
- 作品登録、編集、削除ができる
- 画像アップロードができる
- マスタ編集が保存できる

確認時の注意:

- 管理画面のログイン失敗は 5 回で一時ロックされます
- 誤ったパスワードを続けて試さない

## 9. カスタムドメインを設定する場合

独自ドメインを使う場合は、Cloudflare Dashboard 側で Worker にカスタムドメインを割り当てます。

代表的な流れ:

1. 対象ドメインを Cloudflare に追加する
2. DNS を Cloudflare 管理に切り替える
3. `Workers & Pages` で対象 Worker を開く
4. `Custom Domains` を追加する

コード修正は通常不要です。このアプリケーションは相対パスで API を参照しているため、同一ドメイン上でそのまま動作します。

## 10. よくある失敗と確認方法

### D1 が見つからない

症状:

- `database could not be found`

確認項目:

- `wrangler.jsonc` の `database_id` がダミー値ではないか
- 作成した D1 の UUID が正しく設定されているか

確認コマンド:

```bash
npx wrangler d1 list
```

### 管理画面にログインできない

確認項目:

- `ADMIN_PASSWORD` を本番に登録したか
- `SESSION_SECRET` を本番に登録したか
- `npm run db:migrate:remote` を実行したか
- ログイン試行回数制限に達していないか

Secret 名の確認:

```bash
npx wrangler secret list
```

### マイグレーション不足で管理 API が動かない

確認項目:

- `admin_login_attempts`
- `admin_sessions`

上記テーブルが本番 D1 に存在しているか確認します。

例:

```bash
npx wrangler d1 execute leathercraft-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

## 11. セキュリティ上の運用注意

以下はドキュメントにも残さないでください。

- `ADMIN_PASSWORD` の実値
- `SESSION_SECRET` の実値
- 個人用のメール認証情報
- Cloudflare 以外の外部サービスの認証情報

推奨事項:

- `.dev.vars` を Git に含めない
- Secret をチャットやチケットに貼らない
- パスワード不明時は再設定する
- 退職者や不要になった端末に認証情報を残さない

## 12. 参考コマンド

Cloudflare リソース一覧:

```bash
npx wrangler d1 list
npx wrangler r2 bucket list
```

Secret 名の一覧:

```bash
npx wrangler secret list
```

デプロイ履歴:

```bash
npx wrangler deployments list
```
