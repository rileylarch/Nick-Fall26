# Supabase setup

1. Create a Supabase project at https://supabase.com.
2. In Authentication > Users, add your owner email and password.
3. Open SQL Editor and run `supabase-setup.sql` after replacing `YOUR_OWNER_EMAIL` with that email.
4. Open Project Settings > API and copy the Project URL and publishable/anon key into `supabase-config.js`.
5. Open the app once, click Sign in, and use the owner account.
6. Commit and push the updated files to GitHub Pages.

The site is public read-only by design. Visitors can see shared assignments, grades, and time logs, but Supabase Row Level Security rejects their writes. Your owner account is the only account inserted into `app_admins`.

Never put the Supabase service-role key in this folder or in the browser app. Use only the publishable/anon key.

The first time the owner saves a new record, the app syncs it to Supabase. Existing local records remain in the browser until they are re-entered or migrated.
