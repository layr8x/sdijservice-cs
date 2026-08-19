// src/lib/csvExport.js
// 대용량 메시지 테이블을 CSV로 전부 내려받기 위한 커서(keyset) 페이지 넘김.
// 건너뛰기(offset) 페이지 넘김은 뒤로 갈수록 앞의 행을 전부 세고 지나가야 해서
// 대용량 채널(수십만~백만 건)에서 타임아웃난다 — 커서 방식은 몇 번째 페이지든 속도가 같다.

export const CSV_PAGE = 5000

/**
 * 커서 방식으로 조건에 맞는 행을 전부 받아온다.
 *
 * @param {object}   opts
 * @param {Function} opts.buildQuery  (limit) => supabase 쿼리빌더. 정렬은 시간 내림차순이어야 한다.
 * @param {string}   opts.timeColumn  커서로 쓸 시간 컬럼명 (예: 'sent_at')
 * @param {string}   opts.idColumn    중복 제거에 쓸 고유 컬럼명 (예: 'log_id')
 * @param {Function} [opts.onProgress] 지금까지 받은 건수 콜백(오래 걸릴 때 진행 표시용)
 * @param {number}   [opts.pageSize]  한 번에 받을 건수
 * @param {number}   [opts.maxPages]  안전 상한
 * @returns {Promise<object[]>} 중복 없는 전체 행
 */
export async function fetchAllByCursor({
  buildQuery,
  timeColumn,
  idColumn,
  onProgress,
  pageSize = CSV_PAGE,
  maxPages = 1000,
}) {
  const out = []
  const seen = new Set()
  let cursor = null

  for (let page = 0; page < maxPages; page++) {
    let q = buildQuery(pageSize)
    if (cursor) q = q.lte(timeColumn, cursor)

    const { data, error } = await q
    if (error) throw error
    if (!data || !data.length) break

    let added = 0
    for (const row of data) {
      const id = String(row[idColumn])
      if (seen.has(id)) continue
      seen.add(id)
      out.push(row)
      added++
    }
    onProgress?.(out.length)

    // 겹쳐 받은 것이 전부 중복 = 같은 시각에 pageSize 건 이상 몰림. 더 진행할 수 없다.
    if (added === 0) break
    if (data.length < pageSize) break
    cursor = data[data.length - 1][timeColumn]
  }
  return out
}
