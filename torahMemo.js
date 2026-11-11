import {flags, calendar} from '@hebcal/core';
import {getLeyningForParshaHaShavua, getLeyningForHoliday} from '@hebcal/leyning';
import {LEARNING_MASK} from '@hebcal/rest-api';
import QuickLRU from 'quick-lru';
import {getStartAndEnd} from './date.js';
import {formatHaftarahTheme} from './haftarahTheme.js';

const HOLIDAY_IGNORE_MASK =
  flags.OMER_COUNT |
  flags.SHABBAT_MEVARCHIM |
  flags.MOLAD |
  flags.USER_EVENT |
  flags.HEBREW_DATE |
  LEARNING_MASK;

// The memo is a function only of date, Israel/Diaspora, and untranslated desc.
const cache = new QuickLRU({maxSize: 5000});

/**
 * The production hebcal-web implementation, moved here without changing output.
 * @param {Event} ev
 * @param {boolean} il
 * @return {string}
 */
export function makeTorahMemoText(ev, il) {
  if ((ev.mask & HOLIDAY_IGNORE_MASK) || ev.eventTime !== undefined) {
    return '';
  }
  const hd = ev.getDate();
  const key = [
    hd.getFullYear(), hd.getMonth(), hd.getDate(),
    il ? '1' : '0', ev.getDesc(),
  ].join('-');
  const cached = cache.get(key);
  if (typeof cached === 'string') {
    return cached;
  }
  const reading = ev.hasFlag('PARSHA_HASHAVUA') ?
    getLeyningForParshaHaShavua(ev, il) :
    getLeyningForHoliday(ev, il);
  let memo = '';
  if (reading && (reading.summary || reading.haftara)) {
    if (reading.summary) {
      memo += `Torah: ${reading.summary}`;
    }
    if (reading.summary && reading.haftara) {
      memo += '\n';
    }
    if (reading.haftara) {
      memo += 'Haftarah: ' + reading.haftara;
      if (reading.reason?.haftara) {
        memo += ' | ' + reading.reason.haftara;
      }
      const haftThemeStr = formatHaftarahTheme(reading);
      if (haftThemeStr) {
        memo += ' | ' + haftThemeStr;
      }
    }
  }
  if (reading?.sephardic) {
    memo += '\nHaftarah for Sephardim: ' + reading.sephardic;
  }
  cache.set(key, memo);
  return memo;
}

/**
 * Finished memo rows for eligible events. English descriptions are the stable
 * untranslated keys used by hebcal-api-go when matching against Item.Desc().
 * @param {URL} url
 * @return {{date: string, desc: string, memo: string}[]}
 */
export function torahMemo(url) {
  const sp = url.searchParams;
  const {start, end} = getStartAndEnd(sp);
  const il = sp.get('i') === 'on';
  const events = calendar({start, end, sedrot: true, locale: 'en', il});
  const rows = [];
  for (const ev of events) {
    const memo = makeTorahMemoText(ev, il);
    if (!memo) {
      continue;
    }
    const dt = ev.greg();
    const date = [
      String(dt.getFullYear()).padStart(4, '0'),
      String(dt.getMonth() + 1).padStart(2, '0'),
      String(dt.getDate()).padStart(2, '0'),
    ].join('-');
    rows.push({date, desc: ev.getDesc(), memo});
  }
  return rows;
}
