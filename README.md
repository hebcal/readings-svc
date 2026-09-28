# readings-svc

A small Node.js sidecar microservice that provides three Hebcal APIs which are
not available natively in the Go port of Hebcal web APIs,
[hebcal-api-go](https://github.com/hebcal/hebcal-api-go). The Go service handles
date conversion, zmanim, geolocation and Shabbat times with high throughput, but
it has no leyning (Torah reading) data and cannot compute every daily-learning
series on its own. This service fills those gaps by wrapping the mature
Node.js [`@hebcal`](https://github.com/hebcal) packages and exposing them over a
local Unix-domain socket.

The three APIs are:

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
3. **Shabbat Torah Reading** (`/shabbatTorahReading`) — the leyning for a
   single date from [`@hebcal/leyning`](https://github.com/hebcal/leyning),
   used by the MCP torah-portion tool. Unlike `/leyning`, it does not include
   the triennial cycle.

`/learning` and `/leyning` respond in Hebcal's "classic API" JSON shape,
produced by [`@hebcal/rest-api`](https://github.com/hebcal/rest-api), so they
drop in where hebcal-api-go previously called out to `hebcal-web` over HTTP.
`/shabbatTorahReading` instead returns `@hebcal/leyning`'s
`getLeyningForParshaHaShavua()` (or, for a chag, `getLeyningForHoliday()`)
object verbatim.

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
GET /learning?start=2026-01-10&end=2026-01-10&F=on
```

```json
{
  "title": "Hebcal Diaspora January 2026",
  "date": "2026-09-28T17:05:59.803Z",
  "version": "6.10.0",
  "location": { "geo": "none" },
  "range": { "start": "2026-01-10", "end": "2026-01-10" },
  "items": [
    {
      "title": "Zevachim 118",
      "date": "2026-01-10",
      "hdate": "21 Tevet 5786",
      "category": "dafyomi",
      "hebrew": "זבחים דף קי״ח",
      "link": "https://www.sefaria.org/Zevachim.118a?lang=bi&utm_source=hebcal.com&utm_medium=api"
    }
  ]
}
```

### `GET /shabbatTorahReading`

Torah reading for a single date: the parsha for that Shabbat, or the leyning
for a chag falling on that date.

**Query parameters**

| Parameter | Required | Description |
| --------- | -------- | ----------- |
| `date`    | yes      | Date, `YYYY-MM-DD` |
| `i`       | no       | `i=on` for the Israel schedule |

**Example**

```
GET /shabbatTorahReading?date=2026-01-10
```

Returns @hebcal/leyning's `getLeyningForParshaHaShavua()` (or, for a chag,
`getLeyningForHoliday()`) object verbatim — `name`, `summary`, `fullkriyah`,
`haftara`, and the rest of that shape. Unlike `/leyning`, this does **not**
include the `triennial` cycle.

```json
{
  "name": { "en": "Shemot", "he": "שְׁמוֹת" },
  "type": "shabbat",
  "parsha": ["Shemot"],
  "parshaNum": 13,
  "summary": "Exodus 1:1-6:1",
  "fullkriyah": {
    "1": { "k": "Exodus", "b": "1:1", "e": "1:17", "v": 17 },
    "2": { "k": "Exodus", "b": "1:18", "e": "2:10", "v": 15 },
    "3": { "k": "Exodus", "b": "2:11", "e": "2:25", "v": 15 },
    "4": { "k": "Exodus", "b": "3:1", "e": "3:15", "v": 15 },
    "5": { "k": "Exodus", "b": "3:16", "e": "4:17", "v": 24 },
    "6": { "k": "Exodus", "b": "4:18", "e": "4:31", "v": 14 },
    "7": { "k": "Exodus", "b": "5:1", "e": "6:1", "v": 24 },
    "M": { "k": "Exodus", "b": "5:22", "e": "6:1", "v": 3 }
  },
  "haftara": "Isaiah 27:6-28:13, 29:22-23",
  "haft": [
    { "k": "Isaiah", "b": "27:6", "e": "28:13", "v": 21 },
    { "k": "Isaiah", "b": "29:22", "e": "29:23", "v": 2 }
  ],
  "haftaraNumV": 23,
  "seph": { "k": "Jeremiah", "b": "1:1", "e": "2:3", "v": 22 },
  "sephardic": "Jeremiah 1:1-2:3",
  "sephardicNumV": 22
}
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
GET /leyning?start=2026-01-10&end=2026-01-10
```

```json
{
  "title": "Hebcal Diaspora January 2026",
  "date": "2026-09-28T17:05:59.802Z",
  "version": "6.10.0",
  "location": { "geo": "none" },
  "range": { "start": "2026-01-10", "end": "2026-01-10" },
  "items": [
    {
      "title": "Parashat Shemot",
      "date": "2026-01-10",
      "hdate": "21 Tevet 5786",
      "category": "parashat",
      "leyning": {
        "1": "Exodus 1:1-1:17",
        "2": "Exodus 1:18-2:10",
        "3": "Exodus 2:11-2:25",
        "4": "Exodus 3:1-3:15",
        "5": "Exodus 3:16-4:17",
        "6": "Exodus 4:18-4:31",
        "7": "Exodus 5:1-6:1",
        "torah": "Exodus 1:1-6:1",
        "haftarah": "Isaiah 27:6-28:13, 29:22-23",
        "haftarah_sephardic": "Jeremiah 1:1-2:3",
        "maftir": "Exodus 5:22-6:1",
        "triennial": {
          "1": "Exodus 1:1-1:7",
          "2": "Exodus 1:8-1:12",
          "3": "Exodus 1:13-1:17",
          "4": "Exodus 1:18-1:22",
          "5": "Exodus 2:1-2:10",
          "6": "Exodus 2:11-2:15",
          "7": "Exodus 2:16-2:25",
          "maftir": "Exodus 2:23-2:25"
        }
      }
    }
  ]
}
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
