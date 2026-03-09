export interface AppBindings {
  DB: D1Database
  WORK_IMAGES: R2Bucket
  ADMIN_PASSWORD?: string
  SESSION_SECRET?: string
}

export interface AppEnv {
  Bindings: AppBindings
}
