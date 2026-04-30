import { CAR_COLORS, CAR_NAMES } from '../game/car.js';
import { isMobile } from '../util/detect.js';

// LobbyUI — room creation/join screen and waiting room display.
// Injects its own HTML; must be mounted before boot().

export class LobbyUI {
  constructor() {
    this._el      = null;
    this._onStart = null;
    this._onJoin  = null;

    this._build();
  }

  set onStart(fn) { this._onStart = fn; }
  set onJoin(fn)  { this._onJoin  = fn; }

  _build() {
    this._el = document.createElement('div');
    this._el.id = 'lobby';
    this._el.innerHTML = `
      <div class="lobby-wrap">
        <div class="lobby-logo">
          <span class="logo-pt">PixelTriks</span><br>
          <span class="logo-wrecked">WRECKYARD</span>
        </div>
        <div class="lobby-tagline">CO-OP SURVIVAL DERBY</div>

        <div class="lobby-solo-wrap">
          <button class="lobby-btn primary solo-btn" id="btn-play">ONE PLAYER</button>
        </div>

        <div class="lobby-separator">── MULTIPLAYER ──</div>

        <div class="lobby-mp-wrap">
          <div class="lobby-mp-row">
            <button class="lobby-btn" id="btn-create">CREATE ROOM</button>
            <button class="lobby-btn" id="btn-join">JOIN ROOM</button>
          </div>
          <input id="code-input" class="lobby-input" placeholder="ROOM CODE (OPTIONAL)" maxlength="6" autocomplete="off" inputmode="text" autocapitalize="characters" />
        </div>

        <div id="room-code-display" class="room-code-display hidden"></div>

        <div id="lobby-toast" class="lobby-toast hidden"></div>

        <div id="lobby-error" class="lobby-error hidden"></div>

        <div id="slot-grid" class="slot-grid hidden">
          <div class="lobby-section-title">PLAYERS</div>
          <div class="slots">
            ${[0,1,2,3].map(i => `
              <div class="slot-row" id="slot-${i}">
                <div class="slot-dot" style="background:${CAR_COLORS[i]}; box-shadow: 0 0 8px ${CAR_COLORS[i]}"></div>
                <div class="slot-name" style="color:${CAR_COLORS[i]}">${CAR_NAMES[i]}</div>
                <div class="slot-status" id="slot-status-${i}">EMPTY</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div id="lobby-countdown-wrap" class="lobby-countdown-wrap hidden">
          <div class="lobby-countdown-label">STARTING IN</div>
          <div id="lobby-countdown" class="lobby-countdown">180</div>
          <div class="lobby-countdown-sub">WAITING FOR PLAYERS</div>
          <div class="host-btn-row hidden" id="host-btn-row">
            <button class="lobby-btn primary host-start-btn" id="btn-host-start">START GAME</button>
            <button class="lobby-btn leave-btn" id="btn-leave-room">LEAVE ROOM</button>
          </div>
        </div>

        <div class="lobby-controls-hint">
          ${isMobile ? 'LEFT STICK: DRIVE · FIRE / BOOST / SUPERSHOT BUTTONS' : 'W/S THROTTLE · A/D STEER · SPACE BOOST · ENTER FIRE · Q SUPERSHOT · M MUTE'}
        </div>

        <a class="portal-btn" href="https://vibej.am/portal/2026" target="_blank" rel="noopener">
          EXPLORE OTHER JAM GAMES →
        </a>
      </div>
    `;

    document.body.appendChild(this._el);
    this._injectStyles();
    this._bindEvents();
  }

  _bindEvents() {
    this._el.querySelector('#btn-play').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('lobby:play'));
    });
    this._el.querySelector('#btn-create').addEventListener('click', () => this._onCreate());
    this._el.querySelector('#btn-join').addEventListener('click', () => this._onJoinClick());
    this._el.querySelector('#code-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._onJoinClick();
      e.stopPropagation();
    });
    this._el.querySelector('#btn-host-start').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('lobby:host_start'))
    });
    this._el.querySelector('#btn-leave-room').addEventListener('click', () => {
      this._exitRoomView()
      window.dispatchEvent(new CustomEvent('lobby:leave_room'))
    });
  }

  showToast(msg) {
    const el = this._el.querySelector('#lobby-toast')
    el.textContent = msg
    el.classList.remove('hidden')
    el.style.animation = 'none'
    el.offsetHeight
    el.style.animation = 'toast-fade 2.5s ease-out forwards'
    setTimeout(() => el.classList.add('hidden'), 2500)
  }

  async _onCreate() {
    this._setLoading(true);
    try {
      if (this._onStart) await this._onStart();
    } catch (err) {
      this._showError(err.message || String(err));
    } finally {
      this._setLoading(false);
    }
  }

  async _onJoinClick() {
    const code = this._el.querySelector('#code-input').value.trim().toUpperCase()
    const joinBtn = this._el.querySelector('#btn-join')
    this._setLoading(true)
    const origText = joinBtn.textContent
    try {
      if (code.length > 0) {
        joinBtn.textContent = 'CONNECTING...'
        if (this._onJoin) await this._onJoin(code)
      } else {
        this._showError('ENTER A ROOM CODE')
      }
    } catch (err) {
      this._showError(err.message || String(err))
    } finally {
      joinBtn.textContent = origText
      this._setLoading(false)
    }
  }

  // ── Public API ──

  showRoomCode(code) {
    const el = this._el.querySelector('#room-code-display');
    el.textContent = `ROOM CODE: ${code}`;
    el.classList.remove('hidden');
    this._enterRoomView();
  }

  showSlotGrid() {
    this._el.querySelector('#slot-grid').classList.remove('hidden');
    this._el.querySelector('#lobby-countdown-wrap').classList.remove('hidden');
  }

  _enterRoomView() {
    this._el.querySelector('.lobby-solo-wrap').classList.add('hidden')
    this._el.querySelector('.lobby-separator').classList.add('hidden')
    this._el.querySelector('.lobby-mp-wrap').classList.add('hidden')
    this.showSlotGrid();
  }

  _exitRoomView() {
    this._el.querySelector('.lobby-solo-wrap').classList.remove('hidden')
    this._el.querySelector('.lobby-separator').classList.remove('hidden')
    this._el.querySelector('.lobby-mp-wrap').classList.remove('hidden')
    this._el.querySelector('#slot-grid').classList.add('hidden')
    this._el.querySelector('#lobby-countdown-wrap').classList.add('hidden')
    this._el.querySelector('#room-code-display').classList.add('hidden')
    const row = this._el.querySelector('#host-btn-row')
    if (row) row.classList.add('hidden')
    const startBtn = this._el.querySelector('#btn-host-start')
    if (startBtn) startBtn.classList.remove('hidden')
  }

  setSlot(index, label = 'YOU') {
    const el = this._el.querySelector(`#slot-status-${index}`);
    if (el) { el.textContent = label; el.classList.add('occupied'); }
  }

  setSlotEmpty(index) {
    const el = this._el.querySelector(`#slot-status-${index}`);
    if (el) { el.textContent = 'EMPTY'; el.classList.remove('occupied'); }
  }

  setCountdown(secs) {
    const el = this._el.querySelector('#lobby-countdown');
    if (el) el.textContent = String(Math.max(0, secs));
  }

  showHostStart() {
    const row = this._el.querySelector('#host-btn-row')
    if (row) row.classList.remove('hidden')
  }

  enterAsGuest() {
    this._enterRoomView()
    const row = this._el.querySelector('#host-btn-row')
    if (row) row.classList.remove('hidden')
    const startBtn = this._el.querySelector('#btn-host-start')
    if (startBtn) startBtn.classList.add('hidden')
  }

  hide() {
    this._el.style.opacity = '0';
    this._el.style.pointerEvents = 'none';
    setTimeout(() => { if (this._el) this._el.style.display = 'none'; }, 400);
  }

  _showError(msg) {
    const el = this._el.querySelector('#lobby-error');
    el.textContent = msg; el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 4000);
  }

  _setLoading(on) {
    ['#btn-create','#btn-join'].forEach(s => {
      const b = this._el.querySelector(s);
      if (b) b.disabled = on;
    });
  }

  _injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #lobby {
        position: fixed; inset: 0; z-index: 20;
        display: flex; align-items: center; justify-content: center;
        background: url('hero.png') center/cover no-repeat, #1a1a2e;
        transition: opacity 0.4s;
        font-family: ui-monospace, 'SF Mono', monospace;
        overflow-y: auto; -webkit-overflow-scrolling: touch;
      }
      .lobby-wrap {
        text-align: center; padding: 24px 20px; max-width: 620px; width: 100%;
        background: rgba(0, 0, 0, 0.6); border-radius: 20px;
        backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
        margin: auto;
      }
      .lobby-logo {
        font-size: clamp(32px, 8vw, 64px); font-weight: 900; letter-spacing: 0.05em;
        margin-bottom: 12px; line-height: 1.1;
      }
      .logo-pt { font-size: 0.4em; color: #ffffff; text-shadow: 2px 2px 0 #eab308; display: block; margin-bottom: -10px; }
      .logo-wrecked { color: #ef4444; text-shadow: 4px 4px 0 #eab308; }
      .lobby-tagline {
        font-size: clamp(11px, 2.5vw, 14px); letter-spacing: 0.25em; color: #ffffff; margin-top: 8px; margin-bottom: 36px;
        font-weight: 900; text-shadow: 2px 2px 0 #eab308;
      }
      .lobby-mp-wrap { max-width: 460px; margin: 0 auto 20px; }
      .lobby-mp-row { display: flex; gap: 12px; }
      .lobby-mp-row .lobby-btn { flex: 1; }
      .lobby-toast {
        font-size: clamp(16px, 4vw, 28px); font-weight: 900; letter-spacing: 0.15em;
        color: #ef4444; text-shadow: 2px 2px 0 #eab308;
        text-align: center; margin: 16px auto; padding: 12px;
      }
      @keyframes toast-fade {
        0% { opacity: 0; transform: scale(0.8); }
        15% { opacity: 1; transform: scale(1.05); }
        25% { transform: scale(1); }
        75% { opacity: 1; }
        100% { opacity: 0; transform: scale(0.9); }
      }
      .lobby-section-title { font-size: clamp(10px, 2.5vw, 12px); letter-spacing: 0.3em; color: #ffffff; margin-bottom: 12px; font-weight: 900; text-shadow: 1px 1px 0 #eab308; }
      .lobby-btn {
        display: block; width: 100%; padding: 14px; margin-top: 10px;
        background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.3); border-radius: 12px;
        color: #ffffff; font-family: inherit; font-size: clamp(12px, 3vw, 14px); letter-spacing: 0.15em; font-weight: 900;
        cursor: pointer; transition: transform 0.1s; box-shadow: 4px 4px 0 rgba(0,0,0,0.4);
        text-shadow: 2px 2px 0 #eab308;
      }
      .lobby-btn:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 rgba(0,0,0,0.4); }
      .lobby-btn:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0 rgba(0,0,0,0.4); }
      .lobby-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: 4px 4px 0 rgba(0,0,0,0.4); }
      .lobby-btn.primary { background: #eab308; color: #1a1a2e; text-shadow: none; }
      .lobby-input {
        width: 100%; padding: 13px; box-sizing: border-box;
        background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); border-radius: 12px;
        color: #ffffff; font-family: inherit; font-size: 14px; letter-spacing: 0.2em; font-weight: 900;
        text-align: center; text-transform: uppercase; box-shadow: inset 2px 2px 0 rgba(0,0,0,0.1);
        text-shadow: 2px 2px 0 #eab308;
      }
      .lobby-input:focus { outline: none; border-color: #3b82f6; }
      .room-code-display {
        margin-top: 12px; padding: 10px; background: rgba(255,255,255,0.1);
        border: 2px solid rgba(255,255,255,0.2); border-radius: 12px; color: #ffffff; font-weight: 900;
        font-size: 14px; letter-spacing: 0.2em; box-shadow: 4px 4px 0 rgba(0,0,0,0.4);
        text-shadow: 2px 2px 0 #eab308;
      }
      .lobby-error {
        margin: 12px auto; max-width: 400px; padding: 10px;
        background: rgba(239,68,68,0.15); border: 3px solid #ef4444; border-radius: 12px;
        color: #ff6b6b; font-size: 11px; letter-spacing: 0.1em; font-weight: 900;
        text-shadow: 2px 2px 0 rgba(0,0,0,0.6);
      }
      .slot-grid { margin-top: 24px; }
      .slots { display: flex; flex-direction: column; gap: 8px; max-width: 320px; margin: 12px auto 0; }
      .slot-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(255,255,255,0.08); border: 2px solid rgba(255,255,255,0.2); border-radius: 12px; box-shadow: 3px 3px 0 rgba(0,0,0,0.3); }
      .slot-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); flex-shrink: 0; }
      .slot-name { flex: 1; font-size: 12px; font-weight: 900; letter-spacing: 0.1em; text-align: left; text-shadow: 1px 1px 0 rgba(0,0,0,0.6); }
      .slot-status { font-size: 11px; font-weight: 900; letter-spacing: 0.15em; color: #ffffff; text-shadow: 1px 1px 0 #eab308; }
      .slot-status.occupied { color: #ffffff; }
      .lobby-countdown-wrap { margin-top: 20px; text-align: center; }
      .lobby-countdown-label { font-size: clamp(14px, 3.5vw, 18px); font-weight: 900; letter-spacing: 0.2em; color: #ffffff; text-shadow: 2px 2px 0 #eab308; }
      .lobby-countdown {
        font-size: 96px; font-weight: 900; color: #ef4444; text-shadow: 4px 4px 0 #eab308;
        line-height: 1; margin: 10px 0;
        animation: pulse 1s infinite alternate;
        will-change: transform;
      }
      @keyframes pulse { from { transform: scale(1); } to { transform: scale(1.05); } }
      .lobby-countdown-sub { font-size: clamp(11px, 2.5vw, 13px); font-weight: 900; letter-spacing: 0.2em; color: #ffffff; text-shadow: 1px 1px 0 #eab308; }
      .host-btn-row { display: flex; gap: 12px; max-width: 460px; margin: 16px auto 0; justify-content: center; }
      .host-start-btn { flex: 1; max-width: 220px; font-size: 14px !important; padding: 16px !important; margin-top: 0 !important; }
      .leave-btn { flex: 1; max-width: 220px; font-size: 14px !important; padding: 16px !important; margin-top: 0 !important; background: rgba(239,68,68,0.15) !important; border-color: #ef4444 !important; color: #ff6b6b !important; }
      .lobby-solo-wrap { margin: 0 auto 4px; max-width: 280px; }
      .solo-btn { font-size: 13px !important; padding: 16px !important; margin-top: 0 !important; }
      .lobby-separator { font-size: clamp(10px, 2.5vw, 12px); font-weight: 900; letter-spacing: 0.2em; color: #ffffff; margin: 18px 0 16px; text-shadow: 1px 1px 0 #eab308; }
      .lobby-mp-wrap .lobby-input { margin-top: 12px; }
      .lobby-controls-hint { margin-top: 24px; font-size: clamp(9px, 2vw, 11px); font-weight: 900; letter-spacing: 0.12em; color: #ffffff; text-shadow: 1px 1px 0 #eab308; }
      .portal-btn {
        display: inline-block; margin-top: 20px;
        font-size: clamp(9px, 2vw, 11px); font-weight: 900; letter-spacing: 0.15em; color: #ffffff;
        text-decoration: none; transition: color 0.15s; text-shadow: 1px 1px 0 #eab308;
      }
      .portal-btn:hover { color: #22c55e; }
      .hidden { display: none !important; }

      @media (max-width: 480px) {
        .lobby-wrap { padding: 16px 12px; }
        .lobby-mp-row { flex-direction: column; gap: 8px; }
        .lobby-btn { min-height: 48px; font-size: 12px; }
        .lobby-input { min-height: 48px; font-size: 14px; }
        .solo-btn { min-height: 52px !important; font-size: 14px !important; }
        .lobby-tagline { font-size: 8px; margin-bottom: 20px; }
      }
    `;
    document.head.appendChild(style);
  }
}
