# Private CV Assistant

Cloudflare Workers chat agent that answers questions about a CV stored in
Workers KV. The browser fetches the CV from the Worker on initial load instead
of importing it from a committed source file.

## What this repo does

- Runs a chat agent on Cloudflare Agents / Workers.
- Loads private resume data from a Workers KV namespace bound as `PRIVATE_CV`.
- Uses Workers AI for responses.
- Supports server tools, browser tools, approvals, and scheduling.
- Keeps the CV out of Git-tracked source files and static client bundle source.

## Privacy model

The important boundary in this repo is:

- CV data lives in Workers KV under the key `profile`.
- `src/server.ts` reads that data and builds the system prompt on the server.
- `src/app.tsx` fetches `/api/profile` from the Worker on initial load.

Because the CV is rendered in the browser on initial load, it is visible to any
user who can access the page. KV keeps it out of the repository, but not hidden
from page visitors.

## Tech stack

- Cloudflare Workers
- Cloudflare Agents SDK
- Workers AI
- Workers KV
- React 19
- Vite
- Kumo UI
- Zod

## Project structure

```text
src/
  app.tsx            # Client UI that fetches and renders the CV
  client.tsx         # React entrypoint
  example-prompts.ts # Prompt shortcuts shown in the UI
  private-cv.ts      # CV schema + KV loader
  server.ts          # Chat agent, tools, scheduling, system prompt
  server.test.ts     # Worker/agent tests
  styles.css         # Tailwind + Kumo styles
```

## Requirements

- Node.js
- npm
- Cloudflare account
- Wrangler access for deploys and most Worker-integrated test flows

## Local development

1. Install dependencies:

```bash
npm install
```

2. Put your CV JSON in a local file that is not committed, for example:

```bash
mkdir -p private
```

Save your CV as `private/cv-data.json`.

3. Write that file into local KV under the key `profile`:

```bash
npx wrangler kv key put --binding=PRIVATE_CV profile --path=private/cv-data.json --local
```

4. Start the app:

```bash
npm run dev
```

## Remote KV setup

This repo binds a KV namespace as `PRIVATE_CV` in `wrangler.jsonc`.

To write your CV JSON to the remote KV namespace:

```bash
npx wrangler kv key put --binding=PRIVATE_CV profile --path=private/cv-data.json --remote
```

Then deploy:

```bash
npm run deploy
```

Cloudflare Workers KV docs:

- https://developers.cloudflare.com/kv/
- https://developers.cloudflare.com/kv/concepts/kv-namespaces/
- https://developers.cloudflare.com/kv/platform/limits/
- https://developers.cloudflare.com/workers/wrangler/configuration/

## Available scripts

```bash
npm run dev      # Start local development
npm run start    # Alias for dev
npm run deploy   # Build and deploy with Wrangler
npm run types    # Regenerate Wrangler types
npm run format   # Format files with oxfmt
npm run lint     # Lint src/ with oxlint
npm run check    # Format check + lint + TypeScript
npm test         # Run Vitest
```

## Worker config notes

- Worker config lives in `wrangler.jsonc`.
- KV is bound through `kv_namespaces` as `PRIVATE_CV`.
- If you change bindings in `wrangler.jsonc`, run:

```bash
npm run types
```

## Features implemented

- CV loaded from Workers KV
- Streaming AI chat responses
- Browser-provided timezone tool
- Approval-gated calculator tool
- Demo weather tool
- Task scheduling via Agents scheduling APIs
- WebSocket-backed real-time chat
- Dark/light theme toggle

## Tests

Tests live in `src/server.test.ts` and use `@cloudflare/vitest-pool-workers`.

Depending on your local Cloudflare/Wrangler setup, `npm test` may require:

- Wrangler authentication
- network access
- the ability to start the Worker test pool

If tests fail before executing assertions, check Wrangler auth and Worker test
environment setup first.

## Private CV schema

`src/private-cv.ts` validates the JSON stored in KV with Zod. The expected
payload contains these top-level keys:

- `name`
- `title`
- `location`
- `phone`
- `email`
- `github`
- `gitlab`
- `summary`
- `languages`
- `coreSkills`
- `skills`
- `experience`
- `education`
- `certifications`
- `trainings`
- `achievements`
- `keyProjects`

Invalid JSON or a missing KV value causes the server loader to throw early.

## Security notes

- Do not reintroduce the CV into committed client-side source files.
- Do not commit `private/cv-data.json`.
- Rendering the CV in the browser makes it visible to page visitors.
- If you need stronger protection than plain KV storage, store encrypted data in
  KV and keep the decryption key in a Worker secret.
- If the CV was ever committed to a public Git remote in the past, removing it
  from the current tree does not erase old history.

## Customization

The main customization points are:

- `src/private-cv.ts` for schema changes
- `src/server.ts` for prompt and tool behavior
- `src/example-prompts.ts` for homepage prompt chips
- `src/app.tsx` for client UX

## License

MIT
