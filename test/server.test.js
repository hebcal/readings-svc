import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const INDEX_JS = fileURLToPath(new URL('../index.js', import.meta.url));

// sun_path is 104 bytes on macOS (108 on Linux), including the NUL. macOS's
// os.tmpdir() is a long /var/folders/... path, and TMPDIR may be longer still,
// so fall back to /tmp whenever the socket path would not fit.
const SUN_PATH_MAX = 103;
const SOCKET_NAME = 'rs.sock';

function makeSocketDir() {
  for (const base of [os.tmpdir(), '/tmp']) {
    const dir = fs.mkdtempSync(path.join(base, 'rs-'));
    if (Buffer.byteLength(path.join(dir, SOCKET_NAME)) <= SUN_PATH_MAX) {
      return dir;
    }
    fs.rmSync(dir, {recursive: true, force: true});
  }
  throw new Error('No temp directory short enough for a Unix socket path');
}

const socketDir = makeSocketDir();
const socketPath = path.join(socketDir, SOCKET_NAME);
let child;

before(async () => {
  child = spawn(process.execPath, [INDEX_JS, '--socket', socketPath], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`Server did not start: ${out}`)), 10000);
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('Server listening on socket')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited early with code ${code}: ${out}`));
    });
  });
});

after(() => {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
  }
  fs.rmSync(socketDir, {recursive: true, force: true});
});

/**
 * @param {string} reqPath
 * @return {Promise<{status: number, headers: http.IncomingHttpHeaders, body: any}>}
 */
function get(reqPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({socketPath, path: reqPath, agent: false}, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({status: res.statusCode, headers: res.headers, body: JSON.parse(data)});
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
  });
}

test('listens on a Unix socket with mode 0666', () => {
  const st = fs.statSync(socketPath);
  assert.ok(st.isSocket());
  assert.equal(st.mode & 0o777, 0o666);
});

test('GET /healthz', async () => {
  const res = await get('/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/json');
  assert.deepEqual(res.body, {status: 'ok'});
});

test('GET /learning', async () => {
  const res = await get('/learning?start=2026-01-10&end=2026-01-10&F=on');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.range, {start: '2026-01-10', end: '2026-01-10'});
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].title, 'Zevachim 118');
  assert.equal(res.body.items[0].category, 'dafyomi');
});

test('GET /shabbatTorahReading', async () => {
  const res = await get('/shabbatTorahReading?date=2026-01-10');
  assert.equal(res.status, 200);
  assert.equal(res.body.name.en, 'Shemot');
  assert.equal(res.body.summary, 'Exodus 1:1-6:1');
  assert.equal(res.body.haftara, 'Isaiah 27:6-28:13, 29:22-23');
});

test('GET /leyning', async () => {
  const res = await get('/leyning?start=2026-01-10&end=2026-01-10');
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 1);
  const item = res.body.items[0];
  assert.equal(item.title, 'Parashat Shemot');
  assert.equal(item.leyning.torah, 'Exodus 1:1-6:1');
  assert.equal(item.leyning.triennial['1'], 'Exodus 1:1-1:7');
  assert.equal(item.link, undefined);
  assert.equal(item.memo, undefined);
  assert.equal(item.hebrew, undefined);
});

test('unknown path returns 404', async () => {
  const res = await get('/nope');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, {error: 'Not Found'});
});

test('invalid input returns 400', async () => {
  const res = await get('/leyning?start=bogus&end=2026-01-10');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Date does not match format YYYY-MM-DD: bogus');
});

test('SIGTERM shuts down cleanly and removes the socket', async () => {
  const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  child.kill('SIGTERM');
  assert.equal(await exited, 0);
  assert.equal(fs.existsSync(socketPath), false);
});
