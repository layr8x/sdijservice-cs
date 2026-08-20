// extension/background.js
// 5분마다 수집을 돌린다. 크롬이 켜져 있고 파트너센터에 로그인되어 있으면 자동으로 동작한다.
//
// 여러 직원이 동시에 설치해도 괜찮다. 저장은 전부 덮어쓰기(upsert)라 같은 내용을 두 번 넣어도
// 중복이 생기지 않는다. 오히려 한 사람이 자리를 비워도 다른 사람 쪽에서 계속 모인다.

import { collectAll, checkSession } from './collector.js'

const ALARM = 'collect'
const PERIOD_MIN = 5

async function config() {
  const { endpoint, token } = await chrome.storage.local.get(['endpoint', 'token'])
  return { endpoint, token }
}

async function setStatus(patch) {
  const prev = (await chrome.storage.local.get('status')).status ?? {}
  await chrome.storage.local.set({ status: { ...prev, ...patch, at: Date.now() } })
}

export async function runOnce(trigger = 'auto') {
  const { endpoint, token } = await config()
  if (!endpoint || !token) {
    await setStatus({ state: 'unconfigured', message: '연결 정보가 아직 설정되지 않았습니다' })
    return
  }

  await setStatus({ state: 'running', message: '수집 중…', trigger })
  try {
    const out = await collectAll({ endpoint, token })
    if (!out.ok && out.reason === 'login') {
      await setStatus({
        state: 'login',
        message: '카카오 파트너센터에 로그인해 주세요',
        results: out.results,
      })
      return
    }
    const saved = out.results.reduce((n, r) => n + (r.messages ?? 0), 0)
    await setStatus({
      state: 'ok',
      message: saved > 0 ? `${saved.toLocaleString('ko-KR')}건 저장했습니다` : '새로 들어온 상담이 없습니다',
      account: out.account,
      results: out.results,
    })
  } catch (e) {
    await setStatus({ state: 'error', message: String(e?.message ?? e) })
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: PERIOD_MIN, delayInMinutes: 0.2 })
})
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: PERIOD_MIN, delayInMinutes: 0.2 })
})
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) runOnce('auto')
})

// 팝업에서 "지금 수집" 또는 "연결 확인"을 눌렀을 때
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'run') { runOnce('manual').then(() => reply({ done: true })); return true }
  if (msg?.type === 'check') { checkSession().then(reply); return true }
  return false
})
