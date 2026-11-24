// 르노의 마지막 춤 — 장면 무대
// PC 셋은 고정 자리(좌상·좌중·우상), NPC는 장면마다 따로 저장되어 남은 자리를 채운다.
const MOD = 'rld-sheet'
const FLAG_NPCS = 'stageNpcs'
const FLAG_OFF = 'stageOff'
const SPEAK_MS = 7000

// 자리 순서: [열, 행]  L=왼쪽, R=오른쪽
const PC_SEATS = [['L', 0], ['L', 1], ['R', 0]]
const NPC_SEATS = [['R', 1], ['L', 2], ['R', 2], ['L', 3], ['R', 3]]
const PC_ORDER = [/다니엘|daniel/i, /존|john/i, /벤자민|benjamin/i]

let root = null
let speakingId = null
let speakTimer = null

function pcActors() {
  const ids = game.settings.get(MOD, 'stagePcs')
  if (Array.isArray(ids) && ids.length) return ids.map((id) => game.actors.get(id)).filter(Boolean)
  const pcs = game.actors.filter((a) => a.type === 'vampire' && a.hasPlayerOwner)
  const rank = (a) => { const i = PC_ORDER.findIndex((re) => re.test(a.name)); return i < 0 ? 99 : i }
  return pcs.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 3)
}

function npcActors(scene) {
  const uuids = scene?.getFlag(MOD, FLAG_NPCS) ?? []
  return uuids.map((u) => fromUuidSync(u)).filter((a) => a?.documentName === 'Actor')
}

function stageOn(scene) {
  return !!scene && !scene.getFlag(MOD, FLAG_OFF)
}

function cardHtml(actor, kind, seat) {
  const f = actor.getFlag(MOD, 'stagePortrait') ?? actor.getFlag(MOD, 'portrait') ?? {}
  const s = Number(f.scale ?? 1)
  const pos = `${f.x ?? 50}% ${f.y ?? 0}%`
  const name = String(actor.name).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  return `<article class="rld-stage-card is-${kind}${actor.id === speakingId ? ' is-speaking' : ''}"
      data-actor="${actor.uuid}" data-actor-id="${actor.id}" data-kind="${kind}" data-col="${seat[0]}" data-row="${seat[1]}">
    <div class="rld-stage-img"><img src="${actor.img}" style="object-position:${pos};transform:scale(${s});transform-origin:${pos}" draggable="false"></div>
    <div class="rld-stage-name">${name}</div>
  </article>`
}

function render() {
  if (!root) return
  const scene = canvas?.scene
  if (!stageOn(scene)) { root.innerHTML = ''; root.hidden = true; return }
  root.hidden = false
  const pcs = pcActors()
  const npcs = npcActors(scene).filter((a) => !pcs.includes(a))
  let html = pcs.map((a, i) => cardHtml(a, 'pc', PC_SEATS[i])).join('')
  html += npcs.slice(0, NPC_SEATS.length).map((a, i) => cardHtml(a, 'npc', NPC_SEATS[i])).join('')
  if (game.user.isGM && npcs.length < NPC_SEATS.length) {
    const seat = NPC_SEATS[npcs.length]
    html += `<div class="rld-stage-drop" data-col="${seat[0]}" data-row="${seat[1]}">＋ NPC</div>`
  }
  root.innerHTML = html
  layout()
}

// 왼쪽 툴바와 오른쪽 사이드바 사이에 맞춰 카드 크기·위치 계산
function layout() {
  if (!root || root.hidden) return
  const left = (document.getElementById('scene-controls') ?? document.getElementById('ui-left'))?.getBoundingClientRect()
  const side = document.getElementById('sidebar')?.getBoundingClientRect()
  const x0 = (left?.right ?? 60) + 10
  const x1 = (side && side.width ? side.left : window.innerWidth) - 10
  const items = [...root.querySelectorAll('[data-row]')]
  const rows = Math.max(2, ...items.map((el) => Number(el.dataset.row) + 1))
  const top = 14
  const gap = 10
  const avail = window.innerHeight - top - 90
  const h = Math.max(120, Math.min(205, (avail - gap * (rows - 1)) / rows))
  const w = Math.round(h * 0.78)
  root.style.setProperty('--rld-card-w', `${w}px`)
  root.style.setProperty('--rld-card-h', `${Math.round(h)}px`)
  for (const el of items) {
    const r = Number(el.dataset.row)
    el.style.top = `${top + r * (h + gap)}px`
    el.style.left = el.dataset.col === 'L' ? `${x0}px` : `${x1 - w}px`
  }
}

function speak(actorId) {
  if (!actorId) return
  speakingId = actorId
  root?.querySelectorAll('.rld-stage-card').forEach((el) => el.classList.toggle('is-speaking', el.dataset.actorId === actorId))
  clearTimeout(speakTimer)
  speakTimer = setTimeout(() => {
    speakingId = null
    root?.querySelectorAll('.is-speaking').forEach((el) => el.classList.remove('is-speaking'))
  }, SPEAK_MS)
}

async function addNpc(actor) {
  const scene = canvas?.scene
  if (!scene || !actor) return
  const list = scene.getFlag(MOD, FLAG_NPCS) ?? []
  if (list.includes(actor.uuid)) return
  await scene.setFlag(MOD, FLAG_NPCS, [...list, actor.uuid])
}

async function removeNpc(uuid) {
  const scene = canvas?.scene
  if (!scene) return
  const list = (scene.getFlag(MOD, FLAG_NPCS) ?? []).filter((u) => u !== uuid)
  await scene.setFlag(MOD, FLAG_NPCS, list)
}

function bind() {
  root.addEventListener('click', (ev) => {
    const card = ev.target.closest('.rld-stage-card')
    if (!card) return
    const actor = fromUuidSync(card.dataset.actor)
    if (actor?.testUserPermission(game.user, 'OBSERVER')) actor.sheet.render(true)
  })
  root.addEventListener('contextmenu', (ev) => {
    const card = ev.target.closest('.rld-stage-card.is-npc')
    if (!card || !game.user.isGM) return
    ev.preventDefault()
    removeNpc(card.dataset.actor)
  })
  root.addEventListener('dragover', (ev) => {
    if (!game.user.isGM || !ev.target.closest('.rld-stage-drop')) return
    ev.preventDefault()
    ev.target.closest('.rld-stage-drop').classList.add('is-over')
  })
  root.addEventListener('dragleave', (ev) => ev.target.closest?.('.rld-stage-drop')?.classList.remove('is-over'))
  root.addEventListener('drop', async (ev) => {
    if (!game.user.isGM || !ev.target.closest('.rld-stage-drop')) return
    ev.preventDefault()
    ev.stopPropagation()
    document.body.classList.remove('rld-dragging')
    let data
    try { data = JSON.parse(ev.dataTransfer.getData('text/plain')) } catch { return }
    if (data?.type !== 'Actor') return ui.notifications.warn('액터를 끌어다 놓아 주세요.')
    addNpc(await fromUuid(data.uuid))
  })
  if (game.user.isGM) {
    document.addEventListener('dragstart', () => document.body.classList.add('rld-dragging'), true)
    document.addEventListener('dragend', () => document.body.classList.remove('rld-dragging'), true)
    document.addEventListener('drop', () => document.body.classList.remove('rld-dragging'), true)
  }
}

Hooks.once('init', () => {
  game.settings.register(MOD, 'stagePcs', { scope: 'world', config: false, type: Array, default: [] })
  game.settings.register(MOD, 'stageEnabled', {
    name: '장면 무대 사용', hint: 'PC 셋과 장면별 NPC 카드를 화면에 띄웁니다.',
    scope: 'world', config: true, type: Boolean, default: true, onChange: () => render()
  })
})

Hooks.once('ready', () => {
  if (!game.settings.get(MOD, 'stageEnabled')) return
  root = document.createElement('section')
  root.id = 'rld-stage'
  document.body.appendChild(root)
  bind()
  render()
  window.addEventListener('resize', () => layout())
  game.modules.get(MOD).stage = { addNpc, removeNpc, render, speak }
})

Hooks.on('canvasReady', () => render())
Hooks.on('updateScene', (scene, changed) => {
  if (scene.id !== canvas?.scene?.id) return
  if (foundry.utils.hasProperty(changed, `flags.${MOD}`)) render()
})
Hooks.on('updateActor', (actor, changed) => {
  if (!root?.querySelector(`[data-actor-id="${actor.id}"]`)) return
  if ('img' in changed || 'name' in changed || foundry.utils.hasProperty(changed, `flags.${MOD}`)) render()
})
Hooks.on('collapseSidebar', () => setTimeout(layout, 260))
Hooks.on('renderSidebar', () => setTimeout(layout, 50))
Hooks.on('createChatMessage', (msg) => {
  const id = msg.speaker?.actor || game.users.get(msg.author?.id ?? msg.author)?.character?.id
  if (id) speak(id)
})

// 장면 설정 창에 "무대 끄기" 칸 추가
Hooks.on('renderSceneConfig', (app, html) => {
  const el = html instanceof HTMLElement ? html : html[0]
  const scene = app.document
  if (el.querySelector('.rld-stage-field')) return
  const group = document.createElement('div')
  group.className = 'form-group rld-stage-field'
  group.innerHTML = `<label>장면 무대 숨기기</label>
    <div class="form-fields"><input type="checkbox" name="flags.${MOD}.${FLAG_OFF}" ${scene.getFlag(MOD, FLAG_OFF) ? 'checked' : ''}></div>
    <p class="hint">켜면 이 장면에서는 PC·NPC 카드를 띄우지 않습니다. (지도 장면 등)</p>`
  const anchor = el.querySelector('[name="navigation"]')?.closest('.form-group') ?? el.querySelector('.tab[data-tab="basics"] .form-group, .form-group')
  anchor?.after(group)
})
