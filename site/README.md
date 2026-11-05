# System Design Lab

Learn system design by running it. Each of the 42 lessons has a plain-English introduction, the concept, an estimator that works in both directions, a lab you can tweak and break, the code behind it, and interview follow-ups. It works for complete beginners and for experienced engineers, with learning paths for both.

Everything runs in the browser, so the site is static files and needs no servers to host.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5199.

## Test it

```bash
npm test
```

This runs every lab, checks that every guided experiment's claim holds across several random seeds, checks that every estimate solves in both directions, and stress-tests every lab with extreme parameters and random actions.

To test the production build in a real browser, including every experiment, slider, action and code tab, phone layout, and accessibility:

```bash
npm run test:e2e
```

To run the same browser test against the deployed site:

```bash
E2E_BASE=https://sohumdamani.github.io/SystemDesign-Projects/ node tests/e2e/run.mjs
```

The rate limiter runs the real `Rate Limiter/app/rate_limit.lua` on a Lua VM. To confirm it still behaves exactly like Redis:

```bash
docker run -d --rm --name sdlab-redis-test -p 6390:6379 redis:7-alpine
npm run test:redis
docker stop sdlab-redis-test
```

## Deploy it

```bash
npm run build
```

Upload the `dist` folder to any static host, such as Cloudflare Pages, GitHub Pages or Netlify. It uses hash-based URLs and relative paths, so it needs no server configuration and works from a sub-path.

The site is live at https://sohumdamani.github.io/SystemDesign-Projects/. `.github/workflows/site.yml` tests and redeploys automatically on every push to `main` or `site-launch`, publishing to the `gh-pages` branch that GitHub Pages serves. To deploy from your own machine instead, run `bash scripts/deploy.sh`.

## Add a lesson

1. Add an entry to `src/topics/catalog.ts`, and a plain-English guide to `src/topics/guide.ts`.
2. Create `src/topics/<id>/engine.ts` with the real algorithm. This file is shown to learners, so keep it readable.
3. Create `src/topics/<id>/index.ts`, exporting a `Topic` with the lesson text, the estimator and the lab.

The test suite picks up the new lesson automatically. Every experiment needs a `check` function, and the tests run it against the simulation, so a lesson can't claim something its lab doesn't do.

## Accounts

Profiles and progress are stored in the browser's localStorage, with no password. `src/core/progress.tsx` is the one place to change to use a hosted login service such as Supabase.

## Topic coverage

Core topics follow the public chapter list of *System Design Interview: An Insider's Guide*, Volumes 1 and 2, by Alex Xu and Sahn Lam, with 12 extra lessons beyond them. This project isn't affiliated with the authors, and all text, code and labs here are original.
