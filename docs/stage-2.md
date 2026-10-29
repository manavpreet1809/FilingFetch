# Stage 02: Validate CLI inputs

The CLI validates arguments before reading configuration, creating output directories, opening a database pool, or starting browser retrieval. Parsing lives in `src/cli-options.ts`; `src/cli.ts` starts the retrieval workflow only after validation succeeds.

## Accepted inputs

- Exactly two positional arguments: a matter number and a supported category.
- Matter numbers are trimmed and uppercased, then checked against M followed by exactly five digits.
- All five exact category labels are accepted.
- The default file limit is 10. Explicit limits accept decimal strings 1 through 10.
- `--headed` is a boolean switch; output paths can contain spaces but cannot be blank.

## Rejected inputs

Unknown options, missing or extra positional arguments, malformed matter numbers, unsupported or wrong-case categories, missing option values, blank output paths, and values supplied to boolean switches fail with exit code 1 and clear messages. Limits reject zero, negative values, values above 10, fractions, NaN, infinity, blank strings, hexadecimal, and scientific notation.

## Verification

Run `npm test`, `npm run check`, and `npm run build`. The suite contains 31 passing tests: 24 CLI tests plus seven existing core-retrieval tests. CLI tests cover valid category/default/boundary behavior and 23 invalid argument cases. Each invalid case is exercised in a child process with deliberately invalid cache configuration, proving that the argument error occurs before configuration is read. Tests check exit code 1, the expected diagnostic, no retrieval message, no stack trace, and no created test output directory. No browser installation, credentials, external requests, or live email are needed.

Verification performed October 28, 2026. This milestone covers offline CLI validation; live source navigation remains Stage 03 work.
