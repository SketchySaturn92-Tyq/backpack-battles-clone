/**
 * 战斗舞台：把战斗事件流播成动画。
 *
 * 设计：
 *  - 左右两个角色立绘（像素图），各自带血条与护甲条
 *  - 事件按时间戳排队，逐个播放：出手方前冲/后仰，命中方闪烁后退
 *  - 按 fx 类型叠加特效层：斩击弧、箭矢飞行、火球、治疗光、冰霜、毒雾、闪电
 *  - 纯 DOM + CSS 动画，无 canvas，方便调试也方便截图
 */

const FX_CLASS = {
  slash: 'fx-slash', thrust: 'fx-thrust', heavy: 'fx-heavy',
  arrow: 'fx-arrow', magic: 'fx-magic', burn: 'fx-burn',
  heal: 'fx-heal', shield: 'fx-shield', poison: 'fx-poison',
  frost: 'fx-frost', shock: 'fx-shock',
};

export class BattleStage {
  constructor(root, { onEvent, onFinish, speed = 1 } = {}) {
    this.root = root;
    this.onEvent = onEvent;
    this.onFinish = onFinish;
    this.speed = speed;
    this.timer = null;
    this.queue = [];
    this.playing = false;
    this.index = 0;
  }

  /** 开场：画出两侧角色 */
  setup({ left, right }) {
    this.root.innerHTML = `
      <div class="stage">
        <div class="fighter left" id="fighter-a">
          <div class="nameplate"><span class="fname">${esc(left.name)}</span><span class="fclass">${esc(left.cls || '')}</span></div>
          <div class="bars">
            <div class="bar hp"><i style="width:100%"></i><span>${left.hp}/${left.hp}</span></div>
            <div class="bar armor"><i style="width:0%"></i><span>护甲 0</span></div>
          </div>
          <div class="portrait" id="portrait-a">
            ${left.art ? `<img src="${left.art}" alt="">` : '<div class="ph">?</div>'}
            <div class="fxlayer" id="fx-a"></div>
          </div>
          <div class="weaponline" id="weapons-a"></div>
        </div>

        <div class="stage-middle">
          <div class="vs">VS</div>
          <div class="timer" id="stage-timer">0.0s</div>
        </div>

        <div class="fighter right" id="fighter-b">
          <div class="nameplate"><span class="fname">${esc(right.name)}</span><span class="fclass">${esc(right.cls || '')}</span></div>
          <div class="bars">
            <div class="bar hp"><i style="width:100%"></i><span>${right.hp}/${right.hp}</span></div>
            <div class="bar armor"><i style="width:0%"></i><span>护甲 0</span></div>
          </div>
          <div class="portrait flipped" id="portrait-b">
            ${right.art ? `<img src="${right.art}" alt="">` : '<div class="ph">?</div>'}
            <div class="fxlayer" id="fx-b"></div>
          </div>
          <div class="weaponline" id="weapons-b"></div>
        </div>
      </div>
      <div class="stage-log" id="stage-log"></div>
    `;
    this.elA = this.root.querySelector('#fighter-a');
    this.elB = this.root.querySelector('#fighter-b');
    this.logEl = this.root.querySelector('#stage-log');
    this.timerEl = this.root.querySelector('#stage-timer');
  }

  /**
   * 播放整场战斗。
   * @param {object[]} events
   * @param {object} meta { hpA, maxHpA, hpB, maxHpB, weaponsA, weaponsB }
   */
  play(events, meta = {}) {
    this.queue = events.slice();
    this.meta = meta;
    this.playing = true;
    this.index = 0;
    this.finished = false;
    this.applyWeapons(meta);
    this.startAllCharges();
    this.step();
  }

  /**
   * 画出双方武器，每件武器带一条读条。
   * 读条时长来自武器的占格数（data/items.js 的 chargeSeconds），
   * 读满才挥一次 —— 大剑慢、匕首快，节奏从这里就能看出来。
   */
  applyWeapons({ weaponsA = [], weaponsB = [] } = {}) {
    this.weaponEls = { A: new Map(), B: new Map() };
    const draw = (el, list, side) => {
      if (!el) return;
      el.innerHTML = list.map((w) => `
        <div class="wbar" data-uid="${esc(w.uid || w.name)}">
          <span class="wb-name">${w.order != null ? `<i>#${w.order + 1}</i> ` : ''}${esc(w.name)}</span>
          <span class="wb-track"><i></i></span>
        </div>`).join('');
      for (const w of list) {
        const fill = el.querySelector(`.wbar[data-uid="${cssEscape(w.uid || w.name)}"] .wb-track i`);
        if (fill) this.weaponEls[side].set(w.uid || w.name, { fill, charge: w.charge || 1.5 });
      }
    };
    draw(this.root.querySelector('#weapons-a'), weaponsA, 'A');
    draw(this.root.querySelector('#weapons-b'), weaponsB, 'B');
  }

  /** 让某件武器从头开始读条 */
  startCharge(side, key) {
    const rec = this.weaponEls?.[side]?.get(key);
    if (!rec) return;
    const fill = rec.fill;
    const dur = Math.max(0.12, rec.charge / this.speed);
    fill.style.transition = 'none';
    fill.style.width = '0%';
    void fill.offsetWidth;                 // 强制回流，保证每次都能从头播
    fill.style.transition = `width ${dur}s linear`;
    fill.style.width = '100%';
  }

  /** 开场时所有武器一起开始读条 */
  startAllCharges() {
    for (const side of ['A', 'B']) {
      const map = this.weaponEls?.[side];
      if (!map) continue;
      for (const key of map.keys()) this.startCharge(side, key);
    }
  }

  step() {
    if (!this.playing) return;
    if (this.index >= this.queue.length) {
      this.playing = false;
      this.onFinish?.();
      return;
    }
    const ev = this.queue[this.index++];
    this.renderEvent(ev);

    // 事件越密集播得越快，保证整场控制在合适时长
    const gap = this.gapFor(ev);
    this.timer = setTimeout(() => this.step(), gap / this.speed);
  }

  gapFor(ev) {
    switch (ev.type) {
      case 'start': return 700;
      case 'end': return 400;
      case 'attack': return 340;
      case 'heal': case 'regen': return 180;
      case 'burn': case 'poison': case 'poisonTick': return 160;
      case 'frost': case 'armorBreak': case 'thorns': return 150;
      default: return 140;
    }
  }

  renderEvent(ev) {
    if (ev.type === 'start') {
      this.log(`⚔ ${ev.a.name} 对战 ${ev.b.name}`, 'start');
      return;
    }
    if (ev.type === 'end') {
      this.log(`▣ ${ev.winner === 'draw' ? '平局' : (ev.winner === 'A' ? '你赢了' : '对手获胜')}`, 'end');
      this.onEvent?.(ev);
      return;
    }

    this.timerEl.textContent = `${ev.t.toFixed(1)}s`;

    switch (ev.type) {
      case 'attack': return this.animateAttack(ev);
      case 'heal':
      case 'regen': return this.animateHeal(ev);
      case 'burn': return this.animateDot(ev, 'burn', '🔥');
      case 'poison':
      case 'poisonTick': return this.animateDot(ev, 'poison', '☠');
      case 'frost': return this.animateDot(ev, 'frost', '❄');
      case 'thorns': return this.animateDot(ev, 'thorns', '✹');
      case 'armorBreak': return this.animateDot(ev, 'shatter', '✦');
      default: return this.onEvent?.(ev);
    }
  }

  sideEls(side) {
    return side === 'A'
      ? { self: this.elA, foe: this.elB, selfPortrait: this.root.querySelector('#portrait-a'), foePortrait: this.root.querySelector('#portrait-b') }
      : { self: this.elB, foe: this.elA, selfPortrait: this.root.querySelector('#portrait-b'), foePortrait: this.root.querySelector('#portrait-a') };
  }

  /** 攻击：出手方前冲 + 特效飞向对方 + 对方受击 */
  animateAttack(ev) {
    const { self, foe, selfPortrait, foePortrait } = this.sideEls(ev.side);
    const fxClass = FX_CLASS[ev.fx] || FX_CLASS.slash;

    // 这件武器读满了：重置它的读条，继续下一轮
    this.startCharge(ev.side, ev.weaponUid || ev.weaponName);

    // 出手方
    self?.classList.add(ev.fx === 'heavy' ? 'act-heavy' : (ev.fx === 'arrow' || ev.fx === 'magic' ? 'act-cast' : 'act-lunge'));
    setTimeout(() => self?.classList.remove('act-lunge', 'act-heavy', 'act-cast'), 300);

    // 特效：远程飞过去，近战贴在目标身上
    const ranged = ['arrow', 'magic', 'burn'].includes(ev.fx);
    if (ranged) {
      this.spawnProjectile(ev.fx, selfPortrait, foePortrait);
    }
    setTimeout(() => {
      const fx = document.createElement('div');
      fx.className = `fx ${fxClass}`;
      fx.textContent = fxGlyph(ev.fx);
      foePortrait?.appendChild(fx);
      setTimeout(() => fx.remove(), 520);

      foe?.classList.add(ev.crit ? 'hit-crit' : 'hit');
      setTimeout(() => foe?.classList.remove('hit', 'hit-crit'), 320);
      this.spawnDamageNumber(foePortrait, ev.damage, ev.crit);
      this.updateHp(ev.foeSide, ev.targetHpAfter, ev.targetMaxHp);
      this.updateHp(ev.side, ev.sourceHpAfter, ev.sourceMaxHp);
    }, ranged ? 260 : 80);

    this.log(
      `${who(ev.side)} ${ev.weaponName} → ${ev.damage}${ev.crit ? ' 暴击!' : ''}`,
      ev.crit ? 'crit' : 'attack',
    );
    this.onEvent?.(ev);
  }

  animateHeal(ev) {
    const { selfPortrait } = this.sideEls(ev.side);
    const fx = document.createElement('div');
    fx.className = 'fx fx-heal';
    fx.textContent = '✚';
    selfPortrait?.appendChild(fx);
    setTimeout(() => fx.remove(), 600);
    this.spawnDamageNumber(selfPortrait, ev.amount, false, 'heal');
    this.updateHp(ev.side, ev.hpAfter, ev.maxHp);
    this.log(`${who(ev.side)} 回复 ${ev.amount}`, 'heal');
    this.onEvent?.(ev);
  }

  animateDot(ev, kind, glyph) {
    const targetSide = ev.side || (ev.target ? (ev.target === this.meta?.nameA ? 'A' : 'B') : 'B');
    const { foePortrait, selfPortrait } = this.sideEls(targetSide === 'A' ? 'B' : 'A');
    const holder = ev.type === 'thorns' ? selfPortrait : foePortrait;
    const fx = document.createElement('div');
    fx.className = `fx fx-dot fx-${kind}`;
    fx.textContent = glyph;
    holder?.appendChild(fx);
    setTimeout(() => fx.remove(), 520);
    if (ev.amount) this.spawnDamageNumber(holder, ev.amount, false, kind);
    if (ev.hpAfter !== undefined) this.updateHp(targetSide, ev.hpAfter, ev.maxHp);
    this.log(ev.type === 'poison' ? `中毒加深 ${ev.stacks}` : `${kind} ${ev.amount ?? ''}`, 'dot');
    this.onEvent?.(ev);
  }

  spawnProjectile(kind, fromEl, toEl) {
    if (!fromEl || !toEl) return;
    const layer = this.root.querySelector('.stage');
    if (!layer) return;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const host = this.root.getBoundingClientRect();
    const p = document.createElement('div');
    p.className = `projectile pj-${kind}`;
    p.textContent = kind === 'arrow' ? '➤' : kind === 'burn' ? '●' : '✦';
    p.style.left = `${a.left - host.left + a.width / 2}px`;
    p.style.top = `${a.top - host.top + a.height / 2}px`;
    p.style.setProperty('--dx', `${b.left - a.left + (b.width - a.width) / 2}px`);
    p.style.setProperty('--dy', `${b.top - a.top + (b.height - a.height) / 2}px`);
    layer.appendChild(p);
    setTimeout(() => p.remove(), 620);
  }

  spawnDamageNumber(holder, value, crit, kind = 'damage') {
    if (!holder || value === undefined) return;
    const n = document.createElement('div');
    n.className = `dmg ${kind} ${crit ? 'crit' : ''}`;
    n.textContent = kind === 'heal' ? `+${value}` : `-${value}`;
    n.style.left = `${40 + Math.random() * 30}%`;
    holder.appendChild(n);
    setTimeout(() => n.remove(), 760);
  }

  updateHp(side, hp, maxHp) {
    if (hp === undefined) return;
    const el = side === 'A' ? this.elA : this.elB;
    if (!el) return;
    const fill = el.querySelector('.bar.hp i');
    const label = el.querySelector('.bar.hp span');
    const pct = Math.max(0, Math.min(100, (hp / (maxHp || 1)) * 100));
    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = `${Math.round(hp)}/${maxHp}`;
    if (pct <= 0) el.classList.add('downed');
  }

  log(text, kind = '') {
    if (!this.logEl) return;
    const d = document.createElement('div');
    d.className = `sl ${kind}`;
    d.textContent = text;
    this.logEl.appendChild(d);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  /**
   * 立即结束（跳过动画）。
   * 必须同时触发 onFinish，否则点了「跳过」战斗页会永远停在演出中。
   * finished 标记保证跳过与自然播完只收口一次。
   */
  skip() {
    if (this.finished) return;
    this.finished = true;
    this.playing = false;
    clearTimeout(this.timer);
    this.onFinish?.();
  }

  destroy() {
    this.skip();
    this.root.innerHTML = '';
  }
}

function who(side) { return side === 'A' ? '你' : '对手'; }

function fxGlyph(fx) {
  return {
    slash: '⚔', thrust: '➤', heavy: '✹', arrow: '➤', magic: '✦',
    burn: '🔥', poison: '☠', frost: '❄', shock: '⚡',
  }[fx] || '✧';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** 属性选择器里用的转义，避免 uid 里的特殊字符把选择器搞坏 */
function cssEscape(s) {
  return String(s ?? '').replace(/["\\]/g, '\\$&');
}
