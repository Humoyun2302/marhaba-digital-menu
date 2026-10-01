# MARHABA Hotel & Spa — digital menu

A mobile-first restaurant menu for MARHABA Hotel & Spa. Guests open `/` directly from a QR or NFC tag. The admin panel is only available at `/admin`. There is no public link to it.

This is a new project. It is not connected to any previous Netlify site.

## 1. Local installation

```bash
cd marhaba-digital-menu
npm install
```

Requires Node.js 22 or newer.

## 2. Environment variables

Copy the example file and fill in the public Supabase values:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Use the project URL and the **publishable** or **anon** key only. Never put the service-role key, the database password, or an admin password in the frontend or in git.

`.env` is gitignored. `.env.example` stays empty.

## 3. Supabase project

1. Open the Supabase project that should hold this menu.
2. In **Authentication → Sign In / Providers → Email**, keep email + password enabled.
3. Turn **off** public sign-ups. There is no registration page in this app. Admins are created manually.
4. Confirm the project URL matches `VITE_SUPABASE_URL`.

## 4. Run the SQL

In the Supabase **SQL Editor**, run these files in order:

1. `supabase/migrations/20260930120000_init.sql`
2. `supabase/migrations/20260930230000_admin_activity.sql`
3. `supabase/migrations/20261001120000_qr_and_images.sql`
4. `supabase/seed.sql`

The first migration creates tables, updated-at triggers, Row Level Security, and the `menu-images` and `branding` storage buckets.

`20261001120000_qr_and_images.sql` adds optional serving and photograph fields, then creates exactly 120 permanent table QR codes. Running it again does not replace existing tokens, table numbers, or codes. There is no regenerate action in the admin panel. Before printing, set and lock the canonical domain on the QR page. Print files made before that lock are marked “Not for print”.

Dish photographs that could be matched confidently are stored in `public/menu-photos` under licenses that allow this use, with credit in the dish details. Uncertain and branded items stay without a photo and are listed in Admin → Photos. An administrator can replace any photo; that upload goes to the Supabase `menu-images` bucket. Copying the whole set into Storage from the command line also needs `SUPABASE_SERVICE_ROLE_KEY`, which must never be added to the frontend.

The seed inserts the printed MARHABA menu and one settings row. Running it again does not overwrite rows that already exist.

Public visitors can read active categories, available dishes, their prices, and settings. Writes succeed only when `auth.uid()` is listed in `admin_users`.

## 5. Create the first admin

1. In Supabase, open **Authentication → Users → Add user**.
2. Enter an email and password. You can mark the email as confirmed.
3. Copy that user's UUID.

## 6. Allow that user into the admin panel

In the SQL Editor:

```sql
insert into public.admin_users (user_id)
values ('PASTE-THE-USER-UUID-HERE');
```

The SQL editor runs as the database owner, so this insert is allowed even though the app cannot create the first admin by itself. Sign in at `/admin/login`. An authenticated user who is not in `admin_users` can sign in but cannot open the panel or change data.

## 7. Storage buckets

The migration creates two public-read buckets:

- `menu-images` — dish photos
- `branding` — an optional replacement logo

Uploads are limited to JPEG, PNG, and WebP, 5 MB after the browser compresses them. Only admins can upload, replace, or delete objects. If the bucket statements fail because of permissions, create the same two public buckets in **Storage** and add policies that allow public `select` and admin writes through `public.is_admin()`.

## 8. Local development

```bash
npm run dev
```

Open `/` for the guest menu and `/admin` for the panel. The guest language defaults to Russian and is remembered in `localStorage`.

## 9. Production build

```bash
npm run build
npm run preview
```

`npm run build` typechecks and writes `dist/`. Fix any reported errors before deploying.

## 10. Netlify

Create a **new** Netlify site for this folder. Do not attach it to an existing site, and do not reuse another site ID.

- Build command: `npm run build`
- Publish directory: `dist`
- Node version: 22 (`netlify.toml` already sets this)

`netlify.toml` and `public/_redirects` send every path, including `/admin` and `/admin/login`, to `index.html` so the client router can handle them.

## 11. Netlify environment variables

In the new site, set these before the first production build. Vite reads them at build time, so change them and redeploy if they change.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Do not add the service-role key.

## Guest and admin behaviour

- `/` opens the menu immediately.
- Hidden dishes and empty categories are omitted.
- Prices are whole UZS amounts, grouped as `80 000`. Lemonades keep both unlabeled prices, shown as `35 000 / 90 000`, until an admin adds labels.
- Dish photos are optional. Rows without a photo do not show an empty image box.
- Menu edits in the admin panel are stored in Supabase and appear on the public menu without a new deploy.
