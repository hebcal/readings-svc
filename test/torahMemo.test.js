import assert from 'node:assert/strict';
import test from 'node:test';
import {formatHaftarahTheme} from '../haftarahTheme.js';
import {torahMemo} from '../torahMemo.js';

test('formats Haftarot of Admonition and Consolation', () => {
  assert.equal(
    formatHaftarahTheme({admonition: 1}),
    'First Haftarah of Admonition',
  );
  assert.equal(
    formatHaftarahTheme({consolation: '3,5'}),
    'Third and Fifth Haftarah of Consolation',
  );
  assert.equal(formatHaftarahTheme(undefined), undefined);
});

test('returns English Torah memo rows for parsha events', () => {
  const url = new URL(
    'http://unix/torahMemo?start=2026-09-12&end=2026-09-20',
  );
  const rows = torahMemo(url);
  assert.ok(rows.length > 0);
  assert.ok(rows.every(({date, desc, memo}) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    typeof desc === 'string' &&
    typeof memo === 'string' &&
    memo.length > 0
  ));
  const haazinu = rows.find(row =>
    row.date === '2026-09-19' && /ha['’]?azinu/i.test(row.desc)
  );
  assert.ok(
    haazinu,
    `includes the untranslated Ha'azinu event; got: ${rows
      .filter(row => row.date === '2026-09-19')
      .map(row => row.desc)
      .join(', ')}`,
  );
  assert.match(haazinu.memo, /^Torah: /);
});
