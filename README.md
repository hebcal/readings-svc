# readings-svc

A small Node.js sidecar microservice that provides two Hebcal APIs which are
not available natively in the Go port of Hebcal web APIs,
[hebcal-api-go](https://github.com/hebcal/hebcal-api-go). The Go service handles
date conversion, zmanim, geolocation and Shabbat times with high throughput, but
it has no leyning (Torah reading) data and cannot compute every daily-learning
series on its own. This service fills those two gaps by wrapping the mature
Node.js [`@hebcal`](https://github.com/hebcal) packages and exposing them over a
local Unix-domain socket.

The two APIs are:

1. **Daily Learning** (`/learning`) — the 20 daily-learning series from
   [`@hebcal/learning`](https://github.com/hebcal/learning), used by the PDF
   calendar feature. Six of them cannot be generated in-process by hebcal-go —
   **Sefer HaMitzvot**, **Kitzur Shulchan Arukh**, **Arukh HaShulchan**, **Amud
   HaYomi (Dirshu)**, **Chofetz Chaim** and **Shemirat HaLashon** — which is the
   main reason this service exists.
2. **Leyning** (`/leyning`) — Torah readings for Shabbat and holidays, including
   the triennial cycle, from
   [`@hebcal/leyning`](https://github.com/hebcal/leyning) and
   [`@hebcal/triennial`](https://github.com/hebcal/triennial). This backs the
   `/shabbat?cfg=json` handler in hebcal-api-go.

Responses use Hebcal's "classic API" JSON shape, produced by
[`@hebcal/rest-api`](https://github.com/hebcal/rest-api), so they drop in where
hebcal-api-go previously called out to `hebcal-web` over HTTP.

## Transport

The server listens on a Unix-domain socket rather than a TCP port:

```
/run/hebcal/readings-svc.sock
```

Override the path with `--socket` (or `-s`, or the `SOCKET_PATH` environment
variable) — useful on macOS, which has no `/run`, and where the whole path has
to stay under the ~104-byte `sun_path` limit:

```sh
node index.js --socket /tmp/readings-svc.sock
```

On startup a stale socket file is removed, and the socket is `chmod 0666` so the
web app's user can connect to it. The socket is cleaned up on `SIGINT`,
`SIGTERM` and normal exit. All responses are `application/json`; errors are
returned as `{ "error": "..." }` with HTTP status `400` (bad request, e.g. a
missing or malformed date) or `404` (unknown path).

## Endpoints

### `GET /healthz`

Liveness probe. Returns `200 {"status":"ok"}`.

### `GET /learning`

Daily-learning readings for a date range. Each series is toggled on with its
query code set to `on` or `1`.

**Query parameters**

| Parameter | Required | Description |
| --------- | -------- | ----------- |
| `start`   | yes      | Start date, `YYYY-MM-DD` |
| `end`     | yes      | End date, `YYYY-MM-DD` |
| `lg`      | no       | Locale (default `en`) |
| `i`       | no       | `i=on` for the Israel schedule |

**Series toggles** (`<code>=on`)

| Code    | Series |
| ------- | ------ |
| `F`     | Daf Yomi |
| `myomi` | Mishna Yomi |
| `dpy`   | Perek Yomi |
| `nyomi` | Nach Yomi |
| `dty`   | Tanakh Yomi |
| `dps`   | Psalms (Tehillim) |
| `d929`  | 929 |
| `dr1`   | Rambam (1 chapter/day) |
| `dr3`   | Rambam (3 chapters/day) |
| `dsm`   | **Sefer HaMitzvot** |
| `yyomi` | Yerushalmi (Vilna) |
| `yys`   | Yerushalmi (Schottenstein) |
| `dcc`   | **Chofetz Chaim** |
| `dshl`  | **Shemirat HaLashon** |
| `ayd`   | **Amud HaYomi (Dirshu)** |
| `dw`    | Daf-a-Week |
| `dpa`   | Pirkei Avot (summer) |
| `ahsy`  | **Arukh HaShulchan Yomi** |
| `dksa`  | **Kitzur Shulchan Arukh** |

**Example**

```
GET /learning?start=2026-08-14&end=2026-08-14&dsm=on&dksa=on
```

### `GET /leyning`

Torah readings for Shabbat and holidays that fall within a date range. Only
events that have leyning are returned. Parsha HaShavua events (from 5745 onward)
also include the `triennial` cycle reading.

**Query parameters**

| Parameter | Required | Description |
| --------- | -------- | ----------- |
| `start`   | yes      | Start date, `YYYY-MM-DD` |
| `end`     | yes      | End date, `YYYY-MM-DD` |
| `i`       | no       | `i=on` for the Israel schedule |

**Example**

```
GET /leyning?start=2026-08-14&end=2026-08-22
```

Each returned item carries a `leyning` object with the aliyot, `torah` summary,
`haftarah` (and the `haftarah_sephardic` / `haftarah_chabad` variants where they
differ), `maftir`, and, for a parsha, the `triennial` aliyot.

**English only**, deliberately — this endpoint takes no `lg`. The readings are
locale-invariant (book names, verse references and the `| Shabbat Shekalim`
reasons come out of `@hebcal/leyning` in English whatever the locale), so a
locale would only change each item's `title`, which no caller reads: hebcal-api-go
matches items to its own events by the untranslated event description
(`title_orig`, or `title` when the two are the same). `/learning` does take `lg`,
because its titles *are* the content.

## Development

Requires Node.js (ESM; the package is `"type": "module"`).

```sh
npm install     # install dependencies
node index.js   # start the server on the Unix socket
npm run lint    # lint the *.js source files with oxlint
```

To exercise the service without a Unix-socket HTTP client, use `curl --unix-socket`:

```sh
curl --unix-socket /run/hebcal/readings-svc.sock \
  'http://unix/leyning?start=2026-08-14&end=2026-08-22'
```

## Source layout

| File | Responsibility |
| ---- | -------------- |
| `index.js`    | HTTP server, Unix-socket lifecycle, routing |
| `learning.js` | `/learning` handler and query-code → series mapping |
| `leyning.js`  | `/leyning` handler, including triennial readings |
| `date.js`     | `start`/`end` date parsing and validation |

`systemd/hebcal-readings.service` runs it as a `DynamicUser` unit with
`RuntimeDirectory=hebcal`, which is what creates and cleans up `/run/hebcal`.

## License

BSD-2-Clause. See [`package.json`](package.json).
