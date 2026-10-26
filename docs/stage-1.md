# Stage 1: Core retrieval

FilingFetch accepts a matter number, one of five document categories, and a file limit through its CLI. It retrieves matter metadata, enumerates document rows, skips restricted rows, downloads up to the requested number of files, and writes a report and optional ZIP.

## Local setup

Use Node.js 22 or newer, then run:

```sh
npm ci
npm run browser:install
npm run check
npm test
npm run build
```

## Live acceptance

```sh
CACHE_BACKEND=off npm run fetch -- M12205 "Other Documents" --limit 2 --output outputs/stage-1
```

Use a fresh output directory. No Gmail, OpenAI, database, or cloud credentials are required when caching is off and DATABASE_URL is unset. Compare the report against the official UARB records: matter number/title, all five category counts, selected category, downloaded filenames, and file contents. Verify pagination with a matter requiring multiple pages. Zero qualifying files in a nonempty category exits with status 2; input or retrieval failures exit with status 1. Partial retrieval is identified by warnings and skipped-file reasons.

## Verification status

Offline tests exercise pagination, limits, duplicate rows, restricted rows, incorrect matter responses, empty categories, incomplete listings, category counts, invalid dates, and CLI validation. They use an injected source and synthetic text documents; they do not certify current website selectors or actual source content. Live acceptance remains pending until a real report and manual source comparison are recorded. Existing later-stage email, AI, queue, cache, and cloud code remains in the repository but is outside this stage's acceptance scope.
