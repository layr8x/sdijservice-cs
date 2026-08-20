// extension/collector.js
// 카카오 파트너센터에서 상담 내용을 읽어 사내 데이터베이스로 보내는 실제 동작.
//
// 이 파일이 도는 곳은 직원의 크롬이다. 그래서 카카오 입장에서는 "사람이 브라우저로 보는 것"과
// 구별되지 않는다. 서버에서 부르면 거부당하지만 브라우저에서는 되는 이유가 이것이다.
//
// 개인정보를 가리는 일은 여기서 하지 않는다. 서버(kakao-ingest)가 한다.
// 확장은 직원 PC 에서 도는 프로그램이라 언제든 낡거나 바뀔 수 있어, 가리는 책임을 맡기면 안 된다.

const BASE = 'https://business.kakao.com'

// 시대인재 운영 채널 5개
export const PROFILES = [
  { id: '_VGAQn', label: '마이클래스' },
  { id: '_rcpPG', label: 'LIVE' },
  { id: '_TkpPG', label: 'LIVE 기술지원' },
  { id: '_xfxilXn', label: '콘텐츠' },
  { id: '_rkbcn', label: '통합로그인' },
]

const CHATS_PAGE = 100   // 카카오가 한 번에 주는 최대치
const LOGS_PAGE = 200
const MAX_CHANGED_PER_RUN = 40  // 한 번에 너무 많이 훑지 않는다(직원 PC 부담·카카오 부담)

async function kakao(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    credentials: 'include',   // 직원이 로그인한 세션을 그대로 쓴다
    headers: {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(`HTTP ${res.status} ${path} :: ${body.slice(0, 160)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

/** 파트너센터에 로그인되어 있고 권한이 있는지 확인. 실패 사유를 그대로 돌려준다. */
export async function checkSession() {
  try {
    const me = await kakao('/api/users/me')
    return { ok: true, email: me?.email ?? me?.id ?? null }
  } catch (e) {
    return { ok: false, status: e.status ?? null, reason: e.message }
  }
}

/** 서버에 저장된 마지막 지점을 받아온다 — 이걸로 "바뀐 대화방"만 골라낸다. */
async function fetchCursors(endpoint, token, profileId) {
  const url = `${endpoint}?token=${encodeURIComponent(token)}&profile_id=${encodeURIComponent(profileId)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`커서 조회 실패 (${res.status})`)
  const j = await res.json()
  return j.cursors ?? {}
}

async function sendToServer(endpoint, token, payload) {
  const res = await fetch(`${endpoint}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `저장 실패 (${res.status})`)
  return j
}

/** 채널 하나를 수집한다. 반환값은 화면에 보여줄 요약. */
export async function collectProfile({ endpoint, token, profileId }) {
  const cursors = await fetchCursors(endpoint, token, profileId)

  const search = await kakao(`/api/profiles/${profileId}/chats/search?size=${CHATS_PAGE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  const items = Array.isArray(search?.items) ? search.items : []

  // 마지막 메시지 번호가 저장된 것과 다른 대화방 = 새 내용이 있는 곳
  const changed = items.filter((it) => {
    const last = it?.last_log_id ? String(it.last_log_id) : null
    return last && cursors[String(it.id)] !== last
  }).slice(0, MAX_CHANGED_PER_RUN)

  const messages = []
  for (const it of changed) {
    const chatId = String(it.id)
    try {
      const logs = await kakao(`/api/profiles/${profileId}/chats/${chatId}/chatlogs?size=${LOGS_PAGE}`)
      for (const log of (logs?.items ?? [])) messages.push({ chat_id: chatId, log })
    } catch (e) {
      // 대화방 하나가 실패해도 나머지는 계속한다. 이 방의 커서는 그대로 두므로 다음 번에 다시 시도된다.
      console.warn('[수집] 대화 내용 조회 실패', chatId, e.message)
    }
    await new Promise((r) => setTimeout(r, 120))  // 카카오 쪽에 몰아치지 않도록 간격을 둔다
  }

  // ⚠️ 바뀐 방을 못 가져왔으면 그 방의 메타(=마지막 메시지 번호)도 보내지 않는다.
  //    보내버리면 서버 커서만 최신이 되어, 다음 실행이 "변경 없음"으로 오판해 그 내용을 영영 놓친다.
  const gotChat = new Set(messages.map((m) => m.chat_id))
  const chats = items.filter((it) => {
    const cid = String(it.id)
    const isChanged = changed.some((c) => String(c.id) === cid)
    return !isChanged || gotChat.has(cid)
  })

  const saved = await sendToServer(endpoint, token, { profile_id: profileId, chats, messages })
  return { profileId, scanned: items.length, changed: changed.length, ...saved }
}

/** 5개 채널을 순서대로 수집. 로그인이 풀렸으면 즉시 멈춘다. */
export async function collectAll({ endpoint, token }) {
  const session = await checkSession()
  if (!session.ok) return { ok: false, reason: 'login', detail: session.reason, results: [] }

  const results = []
  for (const p of PROFILES) {
    try {
      results.push({ label: p.label, ...(await collectProfile({ endpoint, token, profileId: p.id })) })
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        results.push({ label: p.label, error: '로그인이 풀렸습니다' })
        return { ok: false, reason: 'login', detail: e.message, results }
      }
      results.push({ label: p.label, error: e.message })
    }
  }
  return { ok: true, account: session.email, results }
}
