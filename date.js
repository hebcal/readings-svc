export const reIsoDate = /^\d\d\d\d-\d\d-\d\d/;

/**
 * Parse a string YYYY-MM-DD and return Date
 * @param {string} str
 * @return {Date}
 */
export function isoDateStringToDate(str) {
  if (!reIsoDate.test(str)) {
    throw new SyntaxError(`Date does not match format YYYY-MM-DD: ${str}`);
  }
  const yy = Number.parseInt(str, 10);
  const mm = Number.parseInt(str.substring(5, 7), 10);
  const dd = Number.parseInt(str.substring(8, 10), 10);
  const dt = new Date(yy, mm - 1, dd);
  if (yy < 100) {
    dt.setFullYear(yy);
  }
  return dt;
}

/**
 * @param {URLSearchParams} searchParams
 * @return {{start: Date, end: Date}}
 */
export function getStartAndEnd(searchParams) {
  const startStr = searchParams.get('start');
  if (!startStr) {
    throw new SyntaxError('Missing required \'start\' query parameter');
  }
  const endStr = searchParams.get('end');
  if (!endStr) {
    throw new SyntaxError('Missing required \'end\' query parameter');
  }
  const start = isoDateStringToDate(startStr);
  const end = isoDateStringToDate(endStr);
  return { start, end };
}
