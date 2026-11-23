// 르노의 마지막 춤 — 판화풍 뱀파이어 시트
// wod5e VampireActorSheet를 상속해서 머리 부분과 능력치 탭만 새 템플릿으로 바꾼다.
// 굴림·판정·칸 조작은 전부 wod5e의 data-action을 그대로 쓴다.

const MOD = 'rld-sheet'
const P = `modules/${MOD}`

const CREST = [
  { re: /toread|토레아/i, img: 'crest_daniel' },
  { re: /tzimis|치미스|쯔미|짐미|티미스/i, img: 'crest_john' },
  { re: /malkav|말카/i, img: 'crest_benjamin' }
]

Hooks.once('init', () => {
  game.settings.register(MOD, 'headerBg', {
    name: '헤더 배경 그림',
    hint: '시트 위쪽 배너에 깔리는 그림.',
    scope: 'world',
    config: true,
    type: String,
    filePicker: 'image',
    default: `${P}/assets/throne.webp`
  })

  Handlebars.registerHelper('rldColLabel', (k) => ({ physical: '신체', social: '사회', mental: '정신' })[k] ?? k)
  Handlebars.registerHelper('rldColIcon', (k) => `${P}/assets/ic_${k}.webp`)
})

let registered = false

async function findBase() {
  try {
    const m = await import('/systems/wod5e/system/actor/vtm/vampire-actor-sheet.js')
    if (m?.VampireActorSheet) return m.VampireActorSheet
  } catch (e) {
    console.warn(`${MOD} | wod5e 시트 파일을 직접 못 불러와서 등록 목록에서 찾을게요.`, e)
  }
  return CONFIG.Actor.sheetClasses?.vampire?.['wod5e.VampireActorSheet']?.cls
}

Hooks.once('init', () => register())

// 용어: 혈기 → 혈량
Hooks.once('i18nInit', () => {
  const vtm = game.i18n.translations?.WOD5E?.VTM
  if (vtm) {
    vtm.BloodPotency = '혈량'
    vtm.BloodSurge = '혈량 고양'
  }
})
Hooks.once('ready', () => register())

async function register() {
  if (registered) return
  const Base = await findBase()
  if (!Base) {
    console.error(`${MOD} | wod5e VampireActorSheet를 찾지 못했어요.`)
    return
  }
  if (registered) return
  registered = true

  class RLDVampireSheet extends Base {
    static DEFAULT_OPTIONS = {
      classes: ['wod5e', 'actor', 'sheet', 'vampire', 'rld-sheet'],
      position: { width: 940, height: 920 },
      actions: {
        rldWillpowerReroll: RLDVampireSheet.#onWillpowerReroll
      }
    }

    static PARTS = (() => {
      const parts = foundry.utils.deepClone(Base.PARTS)
      parts.header = { template: `${P}/templates/header.hbs` }
      parts.stats = { template: `${P}/templates/stats.hbs` }
      delete parts.notepad
      delete parts.banner
      return parts
    })()

    constructor(options = {}) {
      super(options)
      delete this.tabs.notepad
    }

    async _prepareContext(options) {
      const data = await super._prepareContext(options)
      const sys = this.actor.system
      const clanName = data.clan?.name ?? ''
      const crest = CREST.find((c) => c.re.test(clanName))?.img ?? 'crest_daniel'

      const total = Number(sys.derivedXP?.totalXP ?? sys.exp?.max ?? 0) || 0
      const remaining = Number(sys.derivedXP?.remainingXP ?? sys.exp?.value ?? 0) || 0

      data.rld = {
        bg: game.settings.get(MOD, 'headerBg'),
        crest: `${P}/assets/${crest}.webp`,
        clanName: clanName || '혈족 없음',
        potency: sys.blood?.potency ?? 0,
        por: (() => {
          const f = this.actor.getFlag(MOD, 'portrait') ?? {}
          const sc = Number(f.scale) || 1, x = Number(f.x) || 50, y = Number(f.y) || 12
          return `object-position:${x}% ${y}%;transform:scale(${sc});transform-origin:${x}% ${y}%;`
        })(),
        hp: Math.max(0, (sys.health?.max ?? 0) - (sys.health?.superficial ?? 0) - (sys.health?.aggravated ?? 0)),
        wp: Math.max(0, (sys.willpower?.max ?? 0) - (sys.willpower?.superficial ?? 0) - (sys.willpower?.aggravated ?? 0)),
        xp: { total, spent: Math.max(0, total - remaining), remaining },
        assets: P
      }
      return data
    }

    // 의지력 재굴림: 이 캐릭터의 가장 최근 굴림 메시지에 wod5e의 재굴림 창을 띄운다.
    static async #onWillpowerReroll(event) {
      event.preventDefault()
      const actor = this.actor
      const label = game.i18n.localize('WOD5E.Chat.WillpowerReroll')
      const option = ui.chat?._getEntryContextOptions?.().find((o) => o.name === label)
      if (!option) return ui.notifications.warn('의지력 재굴림 기능을 찾지 못했어요.')

      const roots = [ui.chat?.element, document.getElementById('chat-popout')].filter(Boolean)
      const messages = game.messages.contents.filter((m) => m.speaker?.actor === actor.id).reverse()
      for (const m of messages) {
        for (const root of roots) {
          const li = root.querySelector(`.chat-message[data-message-id="${m.id}"]`)
          if (li && option.condition(li)) return option.callback(li)
        }
      }
      ui.notifications.info('다시 굴릴 수 있는 최근 굴림이 없어요.')
    }
  }

  foundry.documents.collections.Actors.registerSheet(MOD, RLDVampireSheet, {
    types: ['vampire'],
    makeDefault: true,
    label: '르노의 마지막 춤 시트'
  })
  console.log(`${MOD} | 시트 등록 완료`)
}
