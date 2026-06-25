#!/usr/bin/env npx tsx
/**
 * Seeds a whiteboard with many Sticky shapes for large-board perf simulation (S2).
 *
 * Usage:
 *   npm run seed-board -- --base-url http://localhost:8080 --count 1300 --board-name loadgen-large
 */
import { seedBoard } from '../src/seed/seedBoard';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {
    'base-url': 'http://localhost:8080',
    count: '1300',
    'board-name': 'loadgen-large',
    'batch-size': '25'
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith('--')) {
        args[key] = value;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args['base-url']!.replace(/\/$/, '');
  const targetCount = Math.max(1, parseInt(args.count!, 10));
  const boardName = args['board-name']!;
  const batchSize = Math.max(1, parseInt(args['batch-size']!, 10));

  const result = await seedBoard({
    baseUrl,
    boardName,
    targetCount,
    batchSize,
    onProgress: ({ created, total }) => {
      if (created % 100 === 0 || created === total) {
        console.log(`  created ${created}/${total}`);
      }
    }
  });

  if (result.skipped) {
    console.log(
      `Board "${result.boardName}" (${result.boardId}) already has ${result.finalCount} shapes (target ${targetCount}). Skipping.`
    );
    return;
  }

  console.log(`Done. Board "${result.boardName}" now has ${result.finalCount} shapes.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
