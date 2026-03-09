# クラス図

## 説明

実装は関数ベースですが、保守しやすいように責務単位の論理クラス図として整理しています。

## クラス図

```mermaid
classDiagram
    class App {
        +boolean adminAuthenticated
        +boolean authReady
        +boolean logoutBusy
    }

    class AppShell
    class HomePage
    class WorkDetailPage
    class AdminPage
    class WorkFormPanel
    class MasterEditor
    class WorkCardList

    class ApiClient {
        +listWorks()
        +getWork(workId)
        +react(workId, type)
        +getAdminSession()
        +login(password)
        +logout()
        +getAdminOverview()
        +getAdminWork(workId)
        +createWork(formData)
        +updateWork(workId, formData)
        +deleteWork(workId)
        +saveMasters(catalog)
    }

    class WorkerApp {
        +getWorks()
        +getWorkDetail()
        +postReaction()
        +getImage()
        +getAdminSession()
        +login()
        +logout()
        +getAdminOverview()
        +getAdminWork()
        +createWork()
        +updateWork()
        +deleteWork()
        +saveMasters()
    }

    class Auth {
        +verifyAdminPassword()
        +createAdminSessionToken()
        +isAdminAuthenticated()
        +setAdminSessionCookie()
        +clearAdminSessionCookie()
        +invalidateAdminSession()
        +requireAdmin()
        +ensureVisitorId()
        +getVisitorId()
    }

    class Security {
        +assertLoginAttemptAllowed()
        +recordFailedLoginAttempt()
        +clearLoginAttempts()
        +getLoginAttemptKey()
        +applyApiSecurityHeaders()
    }

    class Validation {
        +parseWorkFormData()
        +assertValidWorkSelections()
        +parseMasterCatalog()
        +parseReactionType()
        +validateLogin()
    }

    class DbService {
        +listWorks()
        +getWorkDetail()
        +createWorkRecord()
        +updateWorkRecord()
        +deleteWorkRecord()
        +replaceMasterCatalog()
        +replaceWorkEdgeFinishes()
        +listWorkImages()
        +insertWorkImage()
        +removeWorkImages()
        +resequenceWorkImages()
        +getReactionResponse()
        +getMasterCatalog()
    }

    class WorkInput {
        +string title
        +string leatherColor
        +string grain
        +string threadColor
        +string[] edgeFinishes
        +string tanningMethod
        +string listingUrl
        +string notes
    }

    class WorkCard {
        +number id
        +string title
        +string leatherColor
        +string grain
        +string threadColor
        +string tanningMethod
        +string listingUrl
        +string coverImageUrl
        +ReactionCounts reactionCounts
    }

    class WorkDetail {
        +WorkImage[] images
        +ViewerReactions viewerReactions
    }

    class MasterCatalog {
        +string[] leatherColor
        +string[] grain
        +string[] threadColor
        +string[] edgeFinish
        +string[] tanningMethod
    }

    class ReactionCounts {
        +number like
        +number request
    }

    class WorkImage {
        +number id
        +string url
        +string filename
        +number sortOrder
    }

    class ViewerReactions {
        +boolean like
        +boolean request
    }

    App --> AppShell
    App --> HomePage
    App --> WorkDetailPage
    App --> AdminPage

    HomePage --> ApiClient
    WorkDetailPage --> ApiClient
    AdminPage --> ApiClient
    AdminPage --> WorkFormPanel
    AdminPage --> MasterEditor
    HomePage --> WorkCardList

    ApiClient --> WorkerApp
    WorkerApp --> Auth
    WorkerApp --> Security
    WorkerApp --> Validation
    WorkerApp --> DbService

    WorkCard <|-- WorkDetail
    WorkFormPanel --> WorkInput
    AdminPage --> MasterCatalog
    DbService --> WorkCard
    DbService --> WorkDetail
    WorkCard --> ReactionCounts
    WorkDetail --> WorkImage
    WorkDetail --> ViewerReactions
```

## 責務分割

### フロントエンド

- `App`
  - セッション状態とルーティングを管理
- `HomePage`
  - 公開一覧取得と表示
- `WorkDetailPage`
  - 作品詳細取得とリアクション送信
- `AdminPage`
  - 管理画面の状態制御
- `WorkFormPanel`
  - 作品登録・更新フォーム
- `MasterEditor`
  - マスタ編集フォーム

### バックエンド

- `WorkerApp`
  - ルーティングとリクエスト処理
- `Auth`
  - Cookie セッションと認証判定
- `Security`
  - ログイン試行制御とセキュリティヘッダー
- `Validation`
  - 入力値検証
- `DbService`
  - D1 アクセスとデータ組み立て
