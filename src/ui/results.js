import { CAR_COLORS, CAR_NAMES } from '../game/car.js';

export class ResultsUI {
  constructor() {
    this._el = null;
    this.onPlayAgain = null;
    this._build();
  }

  _build() {
    this._el = document.createElement('div');
    this._el.id = 'results-screen';
    this._el.classList.add('hidden');
    this._el.innerHTML = `
      <div class="results-wrap">
        <div class="results-label">MATCH OVER</div>
        <div id="results-winner" class="results-winner"></div>
        <div id="results-stats" class="results-stats"></div>
        <div id="results-ranks" class="results-ranks"></div>
        <button class="results-btn" id="btn-play-again">PLAY AGAIN</button>
        <a class="results-portal" href="https://vibej.am/portal/2026" target="_blank" rel="noopener">EXPLORE JAM →</a>
      </div>
    `;
    document.body.appendChild(this._el);
    this._injectStyles();
    this._el.querySelector('#btn-play-again').addEventListener('click', () => {
      if (this.onPlayAgain) this.onPlayAgain();
    });
  }

  show(winnerSlot, derby) {
    const cars = derby.allCars;

    const winnerEl = this._el.querySelector('#results-winner');
    const localSlot = derby._localSlots?.values().next().value ?? derby.localCar?.slot
    const localStats = derby.playerStats[localSlot] || { kills: 0, damageDealt: 0, damageTaken: 0 };
    const statsEl = this._el.querySelector('#results-stats');
    const ranksEl = this._el.querySelector('#results-ranks');

    if (winnerSlot >= 0) {
      winnerEl.textContent = 'VICTORY';
      winnerEl.style.color = '#22c55e';
      winnerEl.style.textShadow = '3px 3px 0 #1e293b';
    } else {
      winnerEl.textContent = 'ELIMINATED';
      winnerEl.style.color = '#ef4444';
      winnerEl.style.textShadow = '3px 3px 0 #1e293b';
    }

    statsEl.innerHTML = `
      <div class="stat-box"><div class="stat-label">KILLS</div><div class="stat-val">${localStats.kills}</div></div>
      <div class="stat-box"><div class="stat-label">DMG DEALT</div><div class="stat-val">${Math.round(localStats.damageDealt)}</div></div>
      <div class="stat-box"><div class="stat-label">DMG TAKEN</div><div class="stat-val">${Math.round(localStats.damageTaken)}</div></div>
      <div class="stat-box"><div class="stat-label">AI WRECKED</div><div class="stat-val">${derby.aiKills}</div></div>
    `

    const sorted = [...cars].sort((a, b) => {
      if (a.eliminated && !b.eliminated) return 1
      if (!a.eliminated && b.eliminated) return -1
      return a.slot - b.slot
    })

    ranksEl.innerHTML = `
      <div class="rr-header">
        <span class="rr-hcell rr-c-rank">#</span>
        <span class="rr-hcell rr-c-name">DRIVER</span>
        <span class="rr-hcell rr-c-stat">KILLS</span>
        <span class="rr-hcell rr-c-stat">DMG OUT</span>
        <span class="rr-hcell rr-c-stat">DMG IN</span>
        <span class="rr-hcell rr-c-hp">STATUS</span>
      </div>
    ` + sorted.map((c, i) => {
      const st = derby.playerStats[c.slot] || { kills: 0, damageDealt: 0, damageTaken: 0 }
      const color = CAR_COLORS[c.slot % CAR_COLORS.length]
      const status = c.eliminated ? 'WRECKED' : Math.round(c.health) + ' HP'
      const statusColor = c.eliminated ? '#ef4444' : '#22c55e'
      return `
      <div class="rr-row" style="border-left:3px solid ${color}">
        <span class="rr-cell rr-c-rank">${i + 1}</span>
        <span class="rr-cell rr-c-name" style="color:${color}">${c.name}</span>
        <span class="rr-cell rr-c-stat">${st.kills}</span>
        <span class="rr-cell rr-c-stat">${Math.round(st.damageDealt)}</span>
        <span class="rr-cell rr-c-stat">${Math.round(st.damageTaken)}</span>
        <span class="rr-cell rr-c-hp" style="color:${statusColor}">${status}</span>
      </div>`
    }).join('')

    this._el.classList.remove('hidden');
  }

  hide() { this._el.classList.add('hidden'); }

  _injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      #results-screen {
        position: fixed; inset: 0; z-index: 20;
        display: flex; align-items: center; justify-content: center;
        background: rgba(110, 181, 255, 0.9);
        font-family: ui-monospace, 'SF Mono', monospace;
        transition: opacity 0.5s;
      }.results-wrap { text-align: center; padding: 40px 24px; }
      .results-label { font-size: 11px; font-weight: bold; letter-spacing: 0.3em; color: #334155; margin-bottom: 10px; }
      #results-winner {
        font-size: clamp(36px, 8vw, 56px); font-weight: 900; letter-spacing: 0.1em;
        margin-bottom: 24px;
      }
      .results-stats {
        display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;
        margin-bottom: 28px;
      }
      .stat-box {
        background: #ffffff; border: 3px solid #1e293b; border-radius: 12px;
        padding: 12px 20px; box-shadow: 4px 4px 0 #1e293b; min-width: 90px;
      }
      .stat-label {
        font-size: 9px; font-weight: bold; letter-spacing: 0.2em; color: #64748b;
      }
      .stat-val {
        font-size: 22px; font-weight: 900; letter-spacing: 0.1em; color: #1e293b;
        margin: 4px 0 0;
      }
      .results-ranks {
        display: flex; flex-direction: column; gap: 4px;
        max-width: 640px; margin: 0 auto 28px;
        background: rgba(255,255,255,0.15); border: 2px solid rgba(30,41,59,0.3);
        border-radius: 10px; padding: 8px; overflow: hidden;
      }
      .rr-header {
        display: flex; align-items: center; gap: 0;
        padding: 6px 10px; border-bottom: 2px solid rgba(30,41,59,0.2);
        margin-bottom: 4px;
      }
      .rr-hcell {
        font-size: 9px; font-weight: bold; letter-spacing: 0.15em;
        color: #334155; text-align: center;
      }
      .rr-row {
        display: flex; align-items: center; gap: 0;
        padding: 7px 10px; background: rgba(255,255,255,0.25);
        border-radius: 6px;
      }
      .rr-cell { font-size: 12px; font-weight: bold; text-align: center; color: #1e293b; }
      .rr-c-rank { width: 32px; text-align: center; }
      .rr-c-name { flex: 1; text-align: left; letter-spacing: 0.15em; }
      .rr-c-stat { width: 70px; text-align: center; }
      .rr-c-hp   { width: 80px; text-align: right; letter-spacing: 0.05em; }
      .results-btn {
        display: inline-block; padding: 14px 40px; margin-bottom: 20px;
        background: #eab308; border: 3px solid #1e293b; border-radius: 12px;
        color: #1e293b; font-family: inherit; font-size: 14px; font-weight: bold; letter-spacing: 0.2em;
        cursor: pointer; transition: transform 0.1s; box-shadow: 4px 4px 0 #1e293b;
      }
      .results-btn:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 #1e293b; }
      .results-btn:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0 #1e293b; }
      .results-portal {
        display: block; font-size: 10px; font-weight: bold; letter-spacing: 0.2em; color: #334155;
        text-decoration: none; transition: color 0.15s;
      }
      .results-portal:hover { color: #22c55e; }
    `;
    document.head.appendChild(s);
  }
}
