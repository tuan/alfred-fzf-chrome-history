import alfy from "alfy";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { AsyncFzf, byStartAsc } from "fzf";

// Script filter copies Chrome History DB file to this location,
// to get around permission issue
const CHROME_HISTORY_DB_PATH = "/tmp/chrome-history.db";
const DB_CACHE_KEY_PREFIX = "CACHED_FZF_INSTANCE";

const db = await open({
  filename: CHROME_HISTORY_DB_PATH,
  driver: sqlite3.cached.Database,
});

/**
 * Returns a cached Fzf instance for the given domain
 *
 * @export
 * @param {*} domainSqlLikeExpression
 * @param {*} historyResultLimit max number of items in history to search
 * @param {*} fzfResultLimit max number of fuzzy results to return
 * @return {*} fzf instance
 */
export async function createFzfInstanceAsync(
  domainSqlLikeExpression,
  queryLength,
  historyResultLimit,
  fzfResultLimit
) {
  const rows = await queryHistoryAsync(
    domainSqlLikeExpression,
    historyResultLimit
  );
  return new AsyncFzf(rows, {
    selector: (item) => item.title,
    tiebreakers: [byStartAsc],
    limit: fzfResultLimit,
    fuzzy: getFuzzyOption(queryLength),
  });
}

function getFuzzyOption(queryLength) {
  if (queryLength === 0) {
    return false;
  }

  if (queryLength <= 3) {
    return "v1";
  }

  return "v2";
}

async function queryHistoryAsync(domainSqlLikeExpression, historyResultLimit) {
  const dbCacheKey = `${DB_CACHE_KEY_PREFIX}-${domainSqlLikeExpression}-${historyResultLimit}`;
  const cachedData = alfy.cache.get(dbCacheKey);
  if (cachedData != null) {
    return cachedData;
  }

  const sqlQuery = `
    SELECT
      title,
      url,
      (last_visit_time/1000000-11644473600)*1000 as visit_time
    FROM
      urls
    WHERE
      SUBSTR(SUBSTR(url, INSTR(url, '//') + 2), 0, INSTR(SUBSTR(url, INSTR(url, '//') + 2), '/')) LIKE '%${domainSqlLikeExpression}%' AND
      title IS NOT NULL
    GROUP BY
      title
    ORDER BY
      last_visit_time DESC
    LIMIT ${historyResultLimit}
  `;

  const data = await db.all(sqlQuery);
  alfy.cache.set(dbCacheKey, data, { maxAge: 60000 });

  return data;
}
