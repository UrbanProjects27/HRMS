# Huma HRMS deployment

This repository is arranged for GitHub source control, Netlify hosting, and a Supabase Postgres backend.

## 1. Supabase

1. Create a Supabase project and copy its project reference, public URL, anon key, service-role key, database password, and a personal access token.
2. Add the project reference, access token, and database password as GitHub Actions secrets named `SUPABASE_PROJECT_ID`, `SUPABASE_ACCESS_TOKEN`, and `SUPABASE_DB_PASSWORD`.
3. Run the **Deploy Supabase backend** workflow in GitHub, or locally run:

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   supabase functions deploy admin-create-employee
   supabase functions deploy admin-manage-directory
   ```

The migrations create the HRMS tables, employee lifecycle fields, constraints, private leave-document bucket, admin policies, and row-level security. The protected functions create employee Auth accounts and perform admin-only directory changes without exposing the service-role key in Netlify.

Create the first administrator in **Supabase Authentication -> Users**, then insert a matching `public.profiles` row with that Auth user ID and `role = 'admin'`. Admin authorization is checked on the server and is not taken from the role selector in the browser.

## 2. GitHub

1. Create an empty GitHub repository.
2. Push this folder to the repository's `main` branch.
3. Keep `.env` files and service-role credentials out of Git. Only `.env.example` should be committed.

## 3. Netlify

1. In Netlify, select **Add new project → Import an existing project**, then choose the GitHub repository.
2. Netlify will use `netlify.toml`: build command `pnpm run build:netlify`, publish directory `out`.
3. Add these environment variables in Netlify:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. In Supabase **Authentication -> URL Configuration**, set the Netlify production URL as the Site URL and add the Netlify production and preview URLs to Redirect URLs. This is required for password-reset links.
5. Deploy the `main` branch. Future GitHub pushes trigger Netlify deployments automatically.
6. After deployment, open the site URL and confirm the HRMS dashboard loads instead of Netlify's 404 page.
7. The optional `/api/health` path is generated as a static JSON response and can be used to confirm that the deployed files are reachable.

The Netlify build is a static Next.js export. Do not expose `SUPABASE_SERVICE_ROLE_KEY` to browser code. If server-only administrative operations are added later, place that key only in a protected server function.

## Local verification

```bash
pnpm install
pnpm run dev:netlify
pnpm run build:netlify
```

The existing `pnpm run dev` and `pnpm run build` commands remain available for the original Sites/Vinext environment.

## Netlify troubleshooting

If dependency installation fails with `ERR_PNPM_IGNORED_BUILDS`, confirm that `pnpm-workspace.yaml` is present at the GitHub repository root. It contains the reviewed pnpm 11 build-script allowlist required by Next.js and the existing Vinext toolchain.

The file must be alongside `package.json` and `pnpm-lock.yaml`, not inside another folder. Netlify's install log should detect a pnpm workspace; if it says `No pnpm workspaces detected`, the root file has not reached the branch or Netlify base directory being deployed.
