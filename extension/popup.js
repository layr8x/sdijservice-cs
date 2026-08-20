// extension/popup.js — 확장 아이콘을 눌렀을 때 보이는 화면.
// 직원이 알아야 할 것은 셋뿐이다: 지금 되고 있나 / 안 되면 뭘 해야 하나 / 지금 바로 돌리기.

const $ = (id) => document.getElementById(id)

const BADGE = {
  ok:           { cls: 'b-ok',   text: '정상' },
  running:      { cls: 'b-warn', text: '수집 중' },
  login:        { cls: 'b-crit', text: '로그인 필요' },
  error:        { cls: 'b-crit', text: '오류' },
  unconfigured: { cls: 'b-warn', text: '설정 필요' },
}

function when(ts) {
  if (!ts) return ''
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  return `${Math.round(m / 60)}시간 전`
}

function render(status) {
  const s = status ?? { state: 'unconfigured', message: '연결 정보가 아직 설정되지 않았습니다' }
  const b = BADGE[s.state] ?? BADGE.error
  $('badge').className = `badge ${b.cls}`
  $('badge').textContent = b.text
  $('msg').textContent = s.message ?? ''
  $('when').textContent = s.at ? `${when(s.at)}${s.account ? ` · ${s.account}` : ''}` : ''

  const rows = $('rows')
  rows.innerHTML = ''
  if (Array.isArray(s.results) && s.results.length) {
    for (const r of s.results) {
      const div = document.createElement('div')
      div.className = 'r'
      const n = document.createElement('span'); n.className = 'n'; n.textContent = r.label ?? r.profileId ?? ''
      const v = document.createElement('span'); v.className = 'v'
      if (r.error) { v.classList.add('err'); v.textContent = r.error }
      else if (r.messages > 0) { v.textContent = `${r.messages.toLocaleString('ko-KR')}건` }
      else { v.classList.add('zero'); v.textContent = '새 내용 없음' }
      div.append(n, v); rows.append(div)
    }
    rows.hidden = false
  } else {
    rows.hidden = true
  }
}

async function refresh() {
  const { status } = await chrome.storage.local.get('status')
  render(status)
}

$('run').addEventListener('click', async () => {
  $('run').disabled = true
  $('run').textContent = '수집 중…'
  await chrome.runtime.sendMessage({ type: 'run' })
  $('run').disabled = false
  $('run').textContent = '지금 수집'
  refresh()
})

$('open').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://business.kakao.com/' })
})

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    endpoint: $('endpoint').value.trim(),
    token: $('token').value.trim(),
  })
  $('saved').style.display = 'block'
  setTimeout(() => { $('saved').style.display = 'none' }, 2000)
  refresh()
})

// 설정이 비어 있으면 설정 칸을 펼쳐 둔다 — 처음 설치한 사람이 헤매지 않도록.
;(async () => {
  const { endpoint, token } = await chrome.storage.local.get(['endpoint', 'token'])
  if (endpoint) $('endpoint').value = endpoint
  if (token) $('token').value = token
  if (!endpoint || !token) $('setup').open = true
  refresh()
})()

chrome.storage.onChanged.addListener((c) => { if (c.status) render(c.status.newValue) })
