# Petros Curious Mind — Cloudflare social preview Worker

This Worker sits in front of the existing Render Static Site. It does not replace Render, Supabase, or the browser application.

## What it does

- Proxies normal requests and static assets to the existing Render origin.
- Adds homepage Open Graph and Twitter metadata to the first HTML response.
- Looks up a story by its existing `slug` and reads only its title, excerpt, and cover URL.
- Requires `published = true` and `deleted_at IS NULL`; drafts and deleted stories are never used for previews.
- Uses the official site logo when a published story has no valid HTTPS cover URL.
- Returns a 404 for missing/unpublished stories and a 503 if the public story lookup is temporarily unavailable.
- Does not alter story URLs, Supabase tables, frontend JavaScript, or share buttons.

## Configuration

The non-secret values are in `wrangler.toml`. Set the Supabase publishable key as a Worker secret:

```sh
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
```

Paste the existing Supabase **publishable** key when prompted. Never use a service-role or secret key.

## Deploy

The repository workflow `.github/workflows/deploy-story-preview-worker.yml` deploys this Worker when changes to this folder reach `main`.

Add these GitHub repository Actions secrets before merging/deploying:

- `CLOUDFLARE_API_TOKEN`: token with permission to deploy Workers and manage Worker routes for the `petroscuriousmind.name.ng` zone.
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
- `SUPABASE_PUBLISHABLE_KEY`: the existing browser-safe Supabase publishable key.

The first deployment creates the Worker and the two Worker routes declared in `wrangler.toml`:
- `petroscuriousmind.name.ng/*`
- `www.petroscuriousmind.name.ng/*`

Keep the existing root A and www CNAME DNS records proxied. Do not convert these routes to Custom Domains: the Worker must proxy requests to the Render origin.

## Manual local checks

Install Node.js and Wrangler, then from this directory:

```sh
npx wrangler dev
npx wrangler deploy
```

The live workflow is preferred for repeatable deployments. Never put API tokens or Supabase service-role keys in this folder or commit them.

## Acceptance tests

After deployment, inspect the raw HTML response (not only the rendered DOM):

1. Homepage: `https://petroscuriousmind.name.ng/` — `og:type=website`, official logo, homepage title/description and canonical URL.
2. Story A: `https://petroscuriousmind.name.ng/story.html?slug=the-woman-in-the-woods-c261fe` — its own Blogger cover, title and excerpt.
3. Story B: `https://petroscuriousmind.name.ng/story.html?slug=the-eradication-of-dragons-3a060b` — its own different cover, title and excerpt.
4. A published story with no cover — branded fallback image.
5. An unpublished/deleted or unknown slug — 404 with no private story metadata.
6. Static CSS, JavaScript, images, authentication, normal navigation and share buttons — unchanged.

Social platforms cache previews independently. Use Meta Sharing Debugger or the relevant platform refresh tool after deployment; a cached preview may not update immediately.

## Safety and caching

HTML responses are marked `no-store` so an old page-specific preview is not reused by a shared cache. Story metadata is fetched from the public Supabase REST API on each story request. Only the existing public fields needed for the preview are selected. The publishable key is a public client key, but it is stored as a Worker secret to keep configuration tidy. No privileged database credential is used.
