import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Keep production secrets in the host environment, while allowing the documented
// local .env workflow without adding a runtime dependency to the game server.
export function loadEnvFile(file = '.env', env = process.env) {
  const path = resolve(file);
  if (!existsSync(path)) return 0;
  let loaded = 0;
  for (const sourceLine of readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[key] = value;
    loaded++;
  }
  return loaded;
}
