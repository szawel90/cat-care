import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const target = new URL('../.env', import.meta.url);
let contents;
try {
  contents = await readFile(target, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  contents = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
}
const defaults = {
  AUTH_BASE_URL: 'http://127.0.0.1:3000',
  BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
  MAILPIT_URL: 'http://127.0.0.1:8025',
};
for (const [key, value] of Object.entries(defaults)) {
  const pattern = new RegExp(`^${key}=(.*)$`, 'm');
  const match = contents.match(pattern);
  if (!match) contents += `\n${key}=${value}\n`;
  else if (!match[1].trim()) contents = contents.replace(pattern, `${key}=${value}`);
}
await writeFile(target, contents, { mode: 0o600 });
console.log('Local environment ready. Existing settings preserved; missing auth secret generated.');
