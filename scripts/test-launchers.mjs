import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const launcherRoot = path.resolve(root, '..');

async function read(relativePath) {
  return fs.readFile(path.join(launcherRoot, relativePath), 'utf8');
}

function parseExec(value) {
  const tokens = [];
  let token = '';
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '%' && value[index + 1] === '%') {
      token += '%';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (/\s/.test(character) && !quoted) {
      if (token) {
        tokens.push(token);
        token = '';
      }
      continue;
    }

    token += character;
  }

  assert.equal(quoted, false, 'desktop Exec has an unterminated quoted argument');
  assert.equal(escaped, false, 'desktop Exec has a trailing escape');
  if (token) tokens.push(token);
  return tokens;
}

function assertIncludes(text, fragment, description) {
  assert.ok(text.includes(fragment), `${description}: missing ${JSON.stringify(fragment)}`);
}

const bat = await read('setup-and-launch.bat');
const shell = await read('setup-and-launch.sh');
const desktop = await read('setup-and-launch.desktop');
const appShell = await read('setup-and-launch.app/Contents/Resources/setup-and-launch.sh');
const appEntry = await read('setup-and-launch.app/Contents/MacOS/setup-and-launch');

assertIncludes(bat, 'set "LAUNCHER_DIR=%~dp0"', 'Windows launcher must resolve itself');
assertIncludes(bat, 'set "STANDALONE_REPO_DIR=%LAUNCHER_DIR%\\CheapestFlightPicker"', 'Windows launcher must clone beside itself');
assertIncludes(bat, 'set "APP_PORT=8787"', 'Windows launcher must define the default app port');
assertIncludes(bat, 'set "NODE_EMBED_B64=', 'Windows launcher must carry its Node bootstrap fallback');
assertIncludes(bat, 'git clone "%REPO_URL%"', 'Windows launcher must download the repo');
assertIncludes(bat, 'call npm install', 'Windows launcher must install app dependencies');
assertIncludes(bat, "ArgumentList '/k','npm start'", 'Windows launcher must start the server');
assertIncludes(bat, 'call :check_app_health !APP_PORT!', 'Windows launcher must validate the picker health response');
assertIncludes(bat, 'call :select_app_port', 'Windows launcher must select a free fallback port');
assertIncludes(bat, 'ConvertFrom-Json -InputObject', 'Windows launcher must reject unrelated HTTP 200 responses');
assertIncludes(bat, "$env:PORT='!APP_LAUNCH_PORT!'", 'Windows launcher must pass the selected port to the server');
assertIncludes(bat, 'start "" "!APP_URL!"', 'Windows launcher must open the selected app URL');
assert.ok(
  !bat.split('\n').some((line) => line.includes('call :run_powershell') && line.includes('|')),
  'Windows launcher must not put raw PowerShell pipes in :run_powershell calls',
);

for (const [name, text] of [
  ['Unix launcher', shell],
  ['app-bundle launcher', appShell],
]) {
  assertIncludes(text, 'STANDALONE_REPO_DIR=', `${name} must clone beside itself`);
  assertIncludes(text, 'https://github.com/MarsLuay/CheapestFlightPicker.git', `${name} must download the repo`);
  assertIncludes(text, 'npm install', `${name} must install app dependencies`);
  assertIncludes(text, 'npm start', `${name} must start the server`);
}

const execLine = desktop.split('\n').find((line) => line.startsWith('Exec='));
assert.ok(execLine, 'desktop launcher must define Exec');
const execValue = execLine.slice('Exec='.length);
assert.ok(!execValue.startsWith("bash -c '") && !execValue.startsWith("sh -c '"), 'desktop Exec must not rely on shell single-quoting');
const execTokens = parseExec(execValue);
assert.deepEqual(execTokens.slice(0, 2), ['bash', '-c'], 'desktop Exec must invoke bash with a script argument');
assert.equal(execTokens.at(-2), '--', 'desktop Exec must preserve the clicked file as $1');
assert.equal(execTokens.at(-1), '%k', 'desktop Exec must pass the clicked desktop file');
assertIncludes(execValue, '%%20', 'desktop Exec must escape literal percent patterns');
assertIncludes(execValue, '%%23', 'desktop Exec must escape literal percent patterns');
assertIncludes(execValue, '%%25', 'desktop Exec must escape literal percent patterns');
const desktopBootstrap = execTokens[2];
assertIncludes(desktopBootstrap, 'setup-and-launch.sh', 'desktop launcher must find a local shell launcher');
assertIncludes(desktopBootstrap, 'https://raw.githubusercontent.com/MarsLuay/CheapestFlightPicker/main/setup-and-launch.sh', 'desktop launcher must download a shell launcher when alone');
assertIncludes(desktopBootstrap, 'command -v curl', 'desktop launcher must support curl bootstrapping');
assertIncludes(desktopBootstrap, 'command -v wget', 'desktop launcher must support wget bootstrapping');
assertIncludes(desktopBootstrap, 'command -v git', 'desktop launcher must support git bootstrapping');
assertIncludes(desktopBootstrap, 'launcher_file=${1:-.}', 'desktop launcher must resolve its clicked path');
assertIncludes(desktopBootstrap, 'exec bash', 'desktop launcher must hand off to the full bootstrap');

function findBash() {
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe']
    : ['bash'];

  return candidates.find((candidate) => {
    const result = spawnSync(candidate, ['--noprofile', '--norc', '-n'], {
      input: 'true\n',
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    return !result.error && result.status === 0;
  });
}

function toBashPath(value) {
  if (process.platform !== 'win32') return value;
  const match = value.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!match) return value.replaceAll('\\', '/');
  return `/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

const bash = findBash();
if (bash) {
  for (const [name, text] of [
    ['Unix launcher', shell],
    ['app-bundle launcher', appShell],
    ['app-bundle entry point', appEntry],
    ['desktop bootstrap', desktopBootstrap],
  ]) {
    const result = spawnSync(bash, ['--noprofile', '--norc', '-n'], {
      input: `${text}\n`,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${name} failed bash syntax validation: ${result.stderr || result.error || ''}`);
  }
}

assertIncludes(appEntry, '../Resources/setup-and-launch.sh', 'macOS app entry point must use its bundled resource');

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cheapest-flight-picker-launchers-'));
try {
  for (const relativePath of ['setup-and-launch.bat', 'setup-and-launch.sh', 'setup-and-launch.desktop']) {
    const isolatedPath = path.join(temporaryRoot, path.basename(relativePath));
    await fs.copyFile(path.join(launcherRoot, relativePath), isolatedPath);
    const isolatedText = await fs.readFile(isolatedPath, 'utf8');
    assert.ok(isolatedText.length > 0, `${relativePath} must remain usable when copied alone`);
  }

  if (bash) {
    const runtimeRoot = path.join(temporaryRoot, 'launcher with spaces');
    await fs.mkdir(runtimeRoot);
    const runtimeDesktop = path.join(runtimeRoot, 'setup-and-launch.desktop');
    await fs.copyFile(path.join(launcherRoot, 'setup-and-launch.desktop'), runtimeDesktop);
    await fs.writeFile(
      path.join(runtimeRoot, 'setup-and-launch.sh'),
      '#!/usr/bin/env bash\nprintf "%s" "$PWD" > desktop-launcher-marker\n',
    );

    const clickedUri = `file://${encodeURI(toBashPath(runtimeDesktop))}`;
    const result = spawnSync(bash, ['--noprofile', '--norc', '-c', desktopBootstrap, '--', clickedUri], {
      cwd: runtimeRoot,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `desktop bootstrap runtime check failed: ${result.stderr || result.error || ''}`);
    await fs.access(path.join(runtimeRoot, 'desktop-launcher-marker'));
  }

  await fs.cp(
    path.join(launcherRoot, 'setup-and-launch.app'),
    path.join(temporaryRoot, 'setup-and-launch.app'),
    { recursive: true },
  );
  await fs.access(path.join(temporaryRoot, 'setup-and-launch.app/Contents/MacOS/setup-and-launch'));
  await fs.access(path.join(temporaryRoot, 'setup-and-launch.app/Contents/Resources/setup-and-launch.sh'));
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

console.log('Launcher independence checks passed.');
