import { execFileSync } from 'node:child_process';

// Validate Git's actual index, not only the working copy. Cloud-synchronized
// working directories can otherwise publish bytes different from those tested.
const files = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
  .toString('utf8').split('\0').filter(file => /\.(?:js|jsx|mjs|json|css|rules|md)$/.test(file));
let invalid = false;
for (const file of files) {
  const contents = execFileSync('git', ['show', `:${file}`], { maxBuffer: 16 * 1024 * 1024 });
  if (contents.includes(0)) {
    console.error(`Invalid NUL byte in staged text: ${file}`);
    invalid = true;
  }
}
if (invalid) process.exitCode = 1;
else console.log(`Staged text integrity OK (${files.length} files).`);
