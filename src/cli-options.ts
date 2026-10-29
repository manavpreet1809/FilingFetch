import { parseArgs } from 'node:util';
import { DOCUMENT_TYPES, requestSchema } from './domain.js';

export const CLI_USAGE = 'Usage: npm run fetch -- M12205 "Other Documents" [--limit 10] [--headed] [--output directory]';

/** Parse and validate all arguments before configuration, filesystem, or browser work. */
export function parseCliOptions(args: string[]) {
  const { positionals, values } = parseArgs({ args, allowPositionals: true, strict: true, options: {
    limit: { type: 'string', default: '10' }, output: { type: 'string' }, headed: { type: 'boolean', default: false },
  } });
  if (positionals.length !== 2) throw new Error(`Expected a matter number and one document category.\n${CLI_USAGE}`);
  if (!/^(?:[1-9]|10)$/.test(values.limit!)) throw new Error('--limit must be a whole number from 1 to 10.');
  if (values.output !== undefined && !values.output.trim()) throw new Error('--output must be a nonempty directory path.');
  const parsed = requestSchema.safeParse({ matterNumber: positionals[0], documentType: positionals[1], limit: Number(values.limit) });
  if (!parsed.success) {
    const messages = parsed.error.issues.map(issue => issue.path[0] === 'matterNumber'
      ? 'Matter number must be M followed by exactly five digits, such as M12205.'
      : `Document category must be one of: ${DOCUMENT_TYPES.join(', ')}.`);
    throw new Error([...new Set(messages)].join('\n'));
  }
  return { request: parsed.data, output: values.output, headed: values.headed };
}
