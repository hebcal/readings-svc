import http from 'node:http';
import fs from 'node:fs';
import process from 'node:process';
import {parseArgs} from 'node:util';
import {dailyLearning} from './learning.js';
import {leyning, shabbatTorahReading} from './leyning.js';
import {torahMemo} from './torahMemo.js';

const DEFAULT_SOCKET_PATH = '/run/hebcal/readings-svc.sock';

const {values: argv} = parseArgs({
  options: {
    socket: {type: 'string', short: 's'},
  },
});
const SOCKET_PATH = argv.socket || process.env.SOCKET_PATH || DEFAULT_SOCKET_PATH;

if (fs.existsSync(SOCKET_PATH)) {
  fs.unlinkSync(SOCKET_PATH);
}

const server = http.createServer((req, res) => {
  const reqUrl = req.url || '/';
  const url = new URL(reqUrl, 'http://unix');
  try {
    if (url.pathname === '/healthz') {
      sendJsonResponse(res, 200, {status: 'ok'});
    } else if (url.pathname === '/learning') {
      sendJsonResponse(res, 200, dailyLearning(url));
    } else if (url.pathname === '/shabbatTorahReading') {
      sendJsonResponse(res, 200, shabbatTorahReading(url));
    } else if (url.pathname === '/leyning') {
      sendJsonResponse(res, 200, leyning(url));
    } else if (url.pathname === '/torahMemo') {
      sendJsonResponse(res, 200, torahMemo(url));
    } else {
      sendJsonResponse(res, 404, {error: 'Not Found'});
    }
  } catch (err) {
    sendJsonResponse(res, 400, {error: err.message});
  }
});

server.listen(SOCKET_PATH, () => {
  fs.chmodSync(SOCKET_PATH, 0o666);
  console.log(`Server listening on socket: ${SOCKET_PATH}`);
});

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
process.on('exit', unlinkSocket);

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {any} obj
 */
function sendJsonResponse(res, status, obj) {
  res.writeHead(status, {'Content-Type': 'application/json'});
  res.write(JSON.stringify(obj));
  res.end('\n');
}
