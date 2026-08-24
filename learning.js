import '@hebcal/locales';
import '@hebcal/learning';
import {calendar} from '@hebcal/core';
import {eventsToClassicApi} from '@hebcal/rest-api';
import {getStartAndEnd} from './date.js';

const queryToDailyLearningName = {
  F: 'dafYomi',
  myomi: 'mishnaYomi',
  dpy: 'perekYomi',
  nyomi: 'nachYomi',
  dty: 'tanakhYomi',
  dps: 'psalms',
  d929: '929',
  dr1: 'rambam1',
  dr3: 'rambam3',
  dsm: 'seferHaMitzvot',
  yyomi: 'yerushalmi-vilna',
  yys: 'yerushalmi-schottenstein',
  dcc: 'chofetzChaim',
  dshl: 'shemiratHaLashon',
  ayd: 'dirshuAmudYomi',
  dw: 'dafWeeklySunday',
  dpa: 'pirkeiAvotSummer',
  ahsy: 'arukhHaShulchanYomi',
  dksa: 'kitzurShulchanAruch',
  ddh: 'dirshuDafHalacha',
};

/**
 * Build a classic-API response of daily learning readings for a date range.
 * Reads `start` and `end` (YYYY-MM-DD) plus per-learning toggle params
 * (e.g. `F=on`) from the URL's search params.
 * @param {URL} url
 * @return {Object}
 */
export function dailyLearning(url) {
  const sp = url.searchParams;
  const { start, end } = getStartAndEnd(sp);
  const dailyLearning = {};
  for (const [queryName, learningKey] of Object.entries(queryToDailyLearningName)) {
    const val = sp.get(queryName);
    if (val === 'on' || val === '1') {
      dailyLearning[learningKey] = true;
    }
  }
  const options = {
    start,
    end,
    noHolidays: true,
    dailyLearning,
    locale: sp.get('lg') || 'en',
    il: sp.get('i') === 'on',
  };
  const events = calendar(options);
  const obj = eventsToClassicApi(events, options);
  return obj;
}
