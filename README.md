# Leathercraft Introduction

Cloudflare-first portfolio site for handmade leather works.

Recommended stack:

- Language: TypeScript
- Frontend: React + Vite
- Backend: Cloudflare Workers + Hono
- Database: Cloudflare D1
- Image storage: Cloudflare R2

This project includes:

- Public work list and work detail pages
- Up to 4 images per work
- Anonymous `like` and `request` buttons
- Admin login with a password stored in Cloudflare secrets
- Work create/update/delete screen
- Single master edit screen for:
  - leather color
  - grain
  - thread color
  - edge finish
  - tanning method

## Local setup

1. Install dependencies

```bash
npm install
```

2. Copy `.dev.vars.example` to `.dev.vars` and set your own values

```bash
cp .dev.vars.example .dev.vars
```

3. Create Cloudflare resources

```bash
wrangler d1 create leathercraft-db
wrangler r2 bucket create leathercraft-work-images
```

4. Update placeholders in `wrangler.jsonc`

- Replace `database_id`
- Replace `preview_database_id`
- Adjust `bucket_name` and `preview_bucket_name` if needed

5. Apply the migration

```bash
npm run db:migrate:local
```

6. Start local development

```bash
npm run dev
```

## Deploy

Apply the remote migration first:

```bash
npm run db:migrate:remote
```

Then deploy:

```bash
npm run deploy
```

## Verification

The following checks were run successfully:

- `npm run lint`
- `npm run build`
