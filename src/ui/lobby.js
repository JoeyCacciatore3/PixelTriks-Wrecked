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
          <button class="lobby-btn primary solo-btn" id="btn-play">PLAY</button>
        </div>

        <div class="lobby-join-wrap">
          <button class="lobby-btn join-btn" id="btn-join-public" disabled>SEARCHING FOR GAMES...</button>
        </div>

        <div class="lobby-separator">── PRIVATE ROOM ──</div>

        <div class="lobby-grid">
          <div class="lobby-col">
            <div class="lobby-section-title">CREATE ROOM</div>
            <button class="lobby-btn" id="btn-create">CREATE PRIVATE</button>
            <div id="room-code-display" class="room-code-display hidden"></div>
          </div>
          <div class="lobby-divider">OR</div>
          <div class="lobby-col">
            <div class="lobby-section-title">JOIN ROOM</div>
            <input id="code-input" class="lobby-input" placeholder="ENTER CODE" maxlength="6" autocomplete="off" inputmode="text" autocapitalize="characters" />
            <button class="lobby-btn" id="btn-join">JOIN</button>
          </div>
        </div>

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
          <div id="lobby-countdown" class="lobby-countdown">20</div>
          <div class="lobby-countdown-sub">WAITING FOR PLAYERS</div>
        </div>

        <div class="lobby-controls-hint">
          ${isMobile ? 'LEFT STICK: DRIVE · FIRE / BOOST BUTTONS' : 'W/S THROTTLE · A/D STEER · SPACE BOOST · ENTER FIRE · M MUTE'}
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
    this._el.querySelector('#btn-join-public').addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('lobby:join_public'));
    });
    const btnCreate = this._el.querySelector('#btn-create');
    if (btnCreate) btnCreate.addEventListener('click', () => this._onCreate());
    const btnJoin = this._el.querySelector('#btn-join');
    if (btnJoin)   btnJoin.addEventListener('click', () => this._onJoinClick());
    const codeInput = this._el.querySelector('#code-input');
    if (codeInput) codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._onJoinClick();
      e.stopPropagation();
    });
  }

  setJoinAvailable(available) {
    const btn = this._el.querySelector('#btn-join-public')
    if (!btn) return
    if (available) {
      btn.disabled = false
      btn.textContent = 'JOIN GAME'
      btn.classList.add('join-available')
    } else {
      btn.disabled = true
      btn.textContent = 'SEARCHING FOR GAMES...'
      btn.classList.remove('join-available')
    }
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
    const code = this._el.querySelector('#code-input').value.trim().toUpperCase();
    if (code.length < 4) { this._showError('Enter a valid room code'); return; }
    this._setLoading(true);
    try {
      if (this._onJoin) await this._onJoin(code);
    } catch (err) {
      this._showError(err.message || String(err));
    } finally {
      this._setLoading(false);
    }
  }

  // ── Public API ──

  showRoomCode(code) {
    const el = this._el.querySelector('#room-code-display');
    el.textContent = `ROOM CODE: ${code}`;
    el.classList.remove('hidden');
    this.showSlotGrid();
  }

  showSlotGrid() {
    this._el.querySelector('#slot-grid').classList.remove('hidden');
    this._el.querySelector('#lobby-countdown-wrap').classList.remove('hidden');
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

  showError(msg) { this._showError(msg); }

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
      }
      .lobby-wrap {
        text-align: center; padding: 24px 20px; max-width: 620px; width: 100%;
        background: rgba(0, 0, 0, 0.55); border-radius: 20px;
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      }
      .lobby-logo {
        font-size: clamp(32px, 8vw, 64px); font-weight: 900; letter-spacing: 0.05em;
        margin-bottom: 12px; line-height: 1.1;
      }
      .logo-pt { font-size: 0.4em; color: #60a5fa; text-shadow: 2px 2px 0 rgba(0,0,0,0.5); display: block; margin-bottom: -10px; }
      .logo-wrecked { color: #ef4444; text-shadow: 4px 4px 0 #eab308, 0 0 20px rgba(239,68,68,0.5); }
      .lobby-tagline {
        font-size: 11px; letter-spacing: 0.25em; color: #e2e8f0; margin-bottom: 36px;
        font-weight: bold;
      }
      .lobby-grid {
        display: flex; align-items: center; justify-content: center; gap: 20px;
        flex-wrap: wrap; margin-bottom: 20px;
      }
      .lobby-col { flex: 1; min-width: 160px; max-width: 220px; }
      .lobby-divider { font-size: 12px; letter-spacing: 0.3em; color: #94a3b8; font-weight: bold; }
      .lobby-section-title { font-size: 10px; letter-spacing: 0.3em; color: #e2e8f0; margin-bottom: 12px; font-weight: bold; }
      .lobby-btn {
        display: block; width: 100%; padding: 14px; margin-top: 10px;
        background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); border-radius: 12px;
        color: #e2e8f0; font-family: inherit; font-size: 12px; letter-spacing: 0.15em; font-weight: bold;
        cursor: pointer; transition: transform 0.1s; box-shadow: 4px 4px 0 rgba(0,0,0,0.4);
      }
      .lobby-btn:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 rgba(0,0,0,0.4); }
      .lobby-btn:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0 rgba(0,0,0,0.4); }
      .lobby-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: 4px 4px 0 rgba(0,0,0,0.4); }
      .lobby-btn.primary { background: #eab308; color: #1a1a2e; }
      .lobby-input {
        width: 100%; padding: 13px; box-sizing: border-box;
        background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2); border-radius: 12px;
        color: #e2e8f0; font-family: inherit; font-size: 14px; letter-spacing: 0.2em; font-weight: bold;
        text-align: center; text-transform: uppercase; box-shadow: inset 2px 2px 0 rgba(0,0,0,0.1);
      }
      .lobby-input:focus { outline: none; border-color: #3b82f6; }
      .room-code-display {
        margin-top: 12px; padding: 10px; background: rgba(255,255,255,0.1);
        border: 2px solid rgba(255,255,255,0.2); border-radius: 12px; color: #e2e8f0; font-weight: bold;
        font-size: 14px; letter-spacing: 0.2em; box-shadow: 4px 4px 0 rgba(0,0,0,0.4);
      }
      .lobby-error {
        margin: 12px auto; max-width: 400px; padding: 10px;
        background: #fef2f2; border: 3px solid #ef4444; border-radius: 12px;
        color: #b91c1c; font-size: 11px; letter-spacing: 0.1em; font-weight: bold;
      }
      .slot-grid { margin-top: 24px; }
      .slots { display: flex; flex-direction: column; gap: 8px; max-width: 320px; margin: 12px auto 0; }
      .slot-row { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: rgba(255,255,255,0.08); border: 2px solid rgba(255,255,255,0.2); border-radius: 12px; box-shadow: 3px 3px 0 rgba(0,0,0,0.3); }
      .slot-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.3); flex-shrink: 0; }
      .slot-name { flex: 1; font-size: 12px; font-weight: bold; letter-spacing: 0.1em; text-align: left; }
      .slot-status { font-size: 11px; font-weight: bold; letter-spacing: 0.15em; color: #94a3b8; }
      .slot-status.occupied { color: #e2e8f0; }
      .lobby-countdown-wrap { margin-top: 20px; text-align: center; }
      .lobby-countdown-label { font-size: 14px; font-weight: bold; letter-spacing: 0.2em; color: #e2e8f0; }
      .lobby-countdown {
        font-size: 96px; font-weight: 900; color: #ef4444; text-shadow: 4px 4px 0 #1e293b, -4px -4px 0 #ffffff;
        line-height: 1; margin: 10px 0;
        animation: pulse 1s infinite alternate;
      }
      @keyframes pulse { from { transform: scale(1); } to { transform: scale(1.05); } }
      .lobby-countdown-sub { font-size: 12px; font-weight: bold; letter-spacing: 0.2em; color: #94a3b8; }
      .lobby-solo-wrap { margin: 0 auto 4px; max-width: 280px; }
      .solo-btn { font-size: 13px !important; padding: 16px !important; margin-top: 0 !important; }
      .lobby-separator { font-size: 10px; font-weight: bold; letter-spacing: 0.2em; color: #94a3b8; margin: 18px 0 16px; }
      .lobby-join-wrap { margin: 8px auto 0; max-width: 280px; }
      .join-btn { font-size: 11px !important; padding: 12px !important; background: rgba(255,255,255,0.1) !important; }
      .join-btn:disabled { background: rgba(255,255,255,0.05) !important; color: #64748b !important; }
      .join-btn.join-available {
        background: #22c55e !important; color: #fff !important; border-color: #166534 !important;
        box-shadow: 4px 4px 0 #166534, 0 0 20px rgba(34,197,94,0.4) !important;
        animation: join-glow 1.5s infinite alternate;
      }
      @keyframes join-glow { from { box-shadow: 4px 4px 0 #166534, 0 0 12px rgba(34,197,94,0.3); } to { box-shadow: 4px 4px 0 #166534, 0 0 28px rgba(34,197,94,0.6); } }
      .lobby-controls-hint { margin-top: 24px; font-size: 10px; font-weight: bold; letter-spacing: 0.1em; color: #94a3b8; }
      .portal-btn {
        display: inline-block; margin-top: 20px;
        font-size: 10px; font-weight: bold; letter-spacing: 0.15em; color: #94a3b8;
        text-decoration: none; transition: color 0.15s;
      }
      .portal-btn:hover { color: #22c55e; }
      .hidden { display: none !important; }

      @media (max-width: 480px) {
        .lobby-wrap { padding: 16px 12px; }
        .lobby-grid { flex-direction: column; gap: 12px; }
        .lobby-col { max-width: 100%; }
        .lobby-btn { min-height: 48px; font-size: 12px; }
        .lobby-input { min-height: 48px; font-size: 14px; }
        .solo-btn { min-height: 52px !important; font-size: 14px !important; }
        .lobby-divider { margin: 4px 0; }
        .lobby-tagline { font-size: 8px; margin-bottom: 20px; }
      }
    `;
    document.head.appendChild(style);
  }
}
