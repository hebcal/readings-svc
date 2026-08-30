import http from 'node:http';
import fs from 'node:fs';
import process from 'node:process';
import {parseArgs} from 'node:util';
import {dailyLearning} from './learning.js';
import {leyning, shabbatTorahReading} from './leyning.js';

const DEFAULT_SOCKET_PATH = '/run/hebcal/readings-svc.sock';

// Debian puts runtime sockets under /run; macOS has no such directory, so
// development needs the path overridden. node:util's parseArgs keeps this
// dependency-free.
const {values: argv} = parseArgs({
  options: {
    socket: {type: 'string', short: 's'},
  },
});
const SOCKET_PATH = argv.socket || process.env.SOCKET_PATH || DEFAULT_SOCKET_PATH;

// 1. Remove existing socket file if it was left over from a previous run
if (fs.existsSync(SOCKET_PATH)) {
  fs.unlinkSync(SOCKET_PATH);
}

// 2. Create the standard HTTP server
const server = http.createServer((req, res) => {
  const reqUrl = req.url || '/';
  const url = new URL(reqUrl, 'http://unix');
  try {
    if (url.pathname.startsWith('/healthz')) {
      sendJsonResponse(res, 200, { status: 'ok' });
    } else if (url.pathname.startsWith('/learning')) {
      const obj = dailyLearning(url);
      sendJsonResponse(res, 200, obj);
    } else if (url.pathname.startsWith('/shabbatTorahReading')) {
      const obj = shabbatTorahReading(url);
      sendJsonResponse(res, 200, obj);
    } else if (url.pathname.startsWith('/leyning')) {
      const obj = leyning(url);
      sendJsonResponse(res, 200, obj);
    } else {
      sendJsonResponse(res, 404, { error: 'Not Found' });
    }
  } catch (err) {
    sendJsonResponse(res, 400, { error: err.message });
  }
});

// 3. Pass the socket path instead of a port number
server.listen(SOCKET_PATH, () => {
  // chmod 0666 so the web app's user can connect to the socket
  fs.chmodSync(SOCKET_PATH, 0o666);
  console.log(`Server listening on socket: ${SOCKET_PATH}`);
});

// 4. Clean up socket file on process exit
const unlinkSocket = () => {
  if (fs.existsSync(SOCKET_PATH)) {
    fs.unlinkSync(SOCKET_PATH);
  }
};

const shutdown = () => {
  server.close(() => {
    unlinkSocket();
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// 'exit' handlers cannot await anything, so this one only does the synchronous
// half; shutdown() above is what runs on a signal.
process.on('exit', unlinkSocket);

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {any} obj
 */
function sendJsonResponse(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.write(JSON.stringify(obj));
  res.end('\n');
}
