import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const batPath = path.join(root, 'setup-and-launch.bat');
const installB64 = Buffer.from(
  fs.readFileSync(path.join(root, 'install-node-lts.ps1'), 'utf8'),
).toString('base64');
const resolveB64 = Buffer.from(
  fs.readFileSync(path.join(root, 'resolve-node-lts.ps1'), 'utf8'),
).toString('base64');

let bat = fs.readFileSync(batPath, 'utf8');
bat = bat.replace(
  /(:write_embedded_node_install_ps1[\s\S]*?set "NODE_EMBED_B64=)[^"]+(")/,
  `$1${installB64}$2`,
);
bat = bat.replace(
  /(:write_embedded_node_resolve_ps1[\s\S]*?set "NODE_EMBED_B64=)[^"]+(")/,
  `$1${resolveB64}$2`,
);
fs.writeFileSync(batPath, bat);
console.log('Updated embedded Node.js scripts in setup-and-launch.bat');
