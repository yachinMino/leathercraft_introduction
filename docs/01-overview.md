# 概要・機能

## システム概要

本システムは、レザークラフト作品を公開・管理するための Cloudflare ベースの Web サイトです。  
一般ユーザー向けの公開画面と、管理者向けの作品登録・マスタ編集画面で構成されます。

## 主な目的

- 制作した作品を一覧・詳細で紹介する
- 作品ごとに最大 4 枚の画像を掲載する
- 匿名ユーザーが `いいね` と `リクエスト` を送れるようにする
- 管理者が作品情報と選択肢マスタをブラウザから更新できるようにする

## 主要機能

### 公開機能

- 作品一覧表示
- 作品詳細表示
- 作品画像表示
- 匿名の `いいね`
- 匿名の `リクエスト`

### 管理機能

- パスワードログイン
- 作品登録
- 作品編集
- 作品削除
- 画像追加・削除
- 選択肢マスタ編集

## 管理対象データ

### 作品

- 作品名
- 革の色
- シボ
- 糸の色
- ヘリの処理
- 鞣し方
- 出品リンク
- 備考
- 画像 0〜4 枚

### マスタ

- 革の色
- シボ
- 糸の色
- ヘリの処理
- 鞣し方

## 技術的な特徴

- Cloudflare Workers 上で API と静的配信を一体運用
- D1 に作品・リアクション・マスタを保存
- R2 に作品画像を保存
- 管理者ログインは Cookie セッション方式
- ログイン試行回数は IP 単位で 5 回までに制限
- サーバー側で選択値・画像・入力値を検証

## API 一覧

### 公開 API

- `GET /api/works`
- `GET /api/works/:id`
- `POST /api/works/:id/reactions`
- `GET /api/images/:encodedKey`

### 管理 API

- `GET /api/admin/session`
- `POST /api/admin/session`
- `DELETE /api/admin/session`
- `GET /api/admin/overview`
- `GET /api/admin/works/:id`
- `POST /api/admin/works`
- `PUT /api/admin/works/:id`
- `DELETE /api/admin/works/:id`
- `PUT /api/admin/masters`
