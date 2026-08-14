import { calendar, flags } from '@hebcal/core';
import { formatAliyahWithBook } from '@hebcal/leyning';
import { eventsToClassicApiHeader, eventToClassicApiObject } from '@hebcal/rest-api';
import { getTriennialForParshaHaShavua } from '@hebcal/triennial';
import { getStartAndEnd } from './date.js';

/**
 * Returns only events with Leyning. Adds Triennial readings for Parsha HaShavua.
 *
 * English only, deliberately: `lg` is ignored and no locale is read from the
 * query. The readings themselves are locale-invariant -- book names, verse
 * references and the "| Shabbat Shekalim" reasons come out of @hebcal/leyning
 * in English whatever the locale -- so the only thing a locale would change is
 * each item's `title`, and the caller (hebcal-api-go) matches items to its own
 * events by the untranslated event description instead. Hard-coded rather than
 * omitted so the titles cannot follow @hebcal/core's ambient global locale if
 * anything in this process ever calls Locale.setLocale().
 *
 * @param {URL} url
 * @return {Object}
 */
export function leyning(url) {
  const sp = url.searchParams;
  const { start, end } = getStartAndEnd(sp);
  const options = {
    start,
    end,
    sedrot: true,
    locale: 'en',
    il: sp.get('i') === 'on',
  };
  const events = calendar(options);
  const items = events.map((ev) => {
    const item = eventToClassicApiObject(ev, options, true);
    // These three are dropped on size, not on principle: a holiday's `memo` is
    // a sentence of prose and its `link` a long tracked URL, and together with
    // `hebrew` they are 13-51% of the item payload while no caller of this
    // endpoint reads any of them. The rest of the classic-API item stays --
    // `hdate`, `subcat` and `yomtov` are a few bytes each, and keeping them is
    // what makes this recognizably the classic API rather than a shape built
    // for one consumer.
    delete item.link;
    delete item.memo;
    delete item.hebrew;
    if ((ev.getFlags() & flags.PARSHA_HASHAVUA) && ev.getDate().getFullYear() >= 5745) {
      const triReading = getTriennialForParshaHaShavua(ev, options.il);
      const aliyot = triReading?.aliyot;
      if (aliyot) {
        const triAliyot = {};
        for (const [num, aliyah] of Object.entries(aliyot)) {
          if (aliyah !== undefined) {
            const k = num === 'M' ? 'maftir' : num;
            triAliyot[k] = formatAliyahWithBook(aliyah);
          }
        }
        item.leyning.triennial = triAliyot;
      }
    }
    return item;
  });
  const result = eventsToClassicApiHeader(events, options);
  result.items = items.filter(item => item.leyning);
  return result;
}
