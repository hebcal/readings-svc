import http from 'node:http';
import fs from 'node:fs';
import process from 'node:process';
import {parseArgs} from 'node:util';
import {dailyLearning} from './learning.js';
import {leyning} from './leyning.js';

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

const jsonContentType = { 'Content-Type': 'application/json' };

// 2. Create the standard HTTP server
const server = http.createServer((req, res) => {
  const reqUrl = req.url || '/';
  const url = new URL(reqUrl, 'http://unix');
  try {
    if (url.pathname.startsWith('/healthz')) {
      res.writeHead(200, jsonContentType);
      res.end('{"status":"ok"}\n');
    } else if (url.pathname.startsWith('/learning')) {
      const obj = dailyLearning(url);
      res.writeHead(200, jsonContentType);
      res.write(JSON.stringify(obj));
      res.end('\n');
    } else if (url.pathname.startsWith('/leyning')) {
      const obj = leyning(url);
      res.writeHead(200, jsonContentType);
      res.write(JSON.stringify(obj));
      res.end('\n');
    } else {
      res.writeHead(404, jsonContentType);
      res.write(JSON.stringify({ error: 'Not Found' }));
      res.end('\n');
    }
  } catch (err) {
    res.writeHead(400, jsonContentType);
    res.write(JSON.stringify({ error: err.message }));
    res.end('\n');
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
