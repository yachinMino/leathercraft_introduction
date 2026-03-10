# ドキュメント一覧

このフォルダには、レザークラフト作品紹介サイトの設計・構成資料を分割して配置しています。

- [概要・機能](./01-overview.md)
- [画面遷移図](./02-screen-flow.md)
- [ER 図](./03-er-diagram.md)
- [クラス図](./04-class-diagram.md)
- [シーケンス図](./05-sequence-diagram.md)
- [インフラ構成](./06-infrastructure.md)
- [バリデーション](./07-validation.md)
- [アプリケーションデプロイ手順](./08-deployment.md)

## 対象システム

- フロントエンド: React + Vite
- バックエンド: Cloudflare Workers + Hono
- データベース: Cloudflare D1
- 画像保存: Cloudflare R2

## 補足

- 図は Mermaid 形式で記載しています。
- クラス図は、TypeScript の実クラスではなく、責務単位の論理コンポーネント図として表現しています。
