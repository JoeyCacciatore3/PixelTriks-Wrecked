import Peer from 'peerjs';

const PRIVATE_PREFIX = 'wy-'

function randomCode(len = 6) {
  return Array.from({ length: len }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
  ).join('');
}

export class RoomManager {
  constructor() {
    this._peer     = null
    this._conns    = {}
    this.code      = null
    this.myId      = null
    this.mySlot    = -1
    this.isHost    = false
    this._slots    = {}
    this._lastPong = {}
    this._heartbeatId = null
  }

  async createRoom() {
    const code   = randomCode()
    const peerId = PRIVATE_PREFIX + code.toLowerCase()

    this._peer = new Peer(peerId)
    await new Promise((resolve, reject) => {
      this._peer.on('open',  ()    => resolve())
      this._peer.on('error', (err) => reject(new Error(err.type || String(err))))
    })

    this.code   = code
    this.myId   = peerId
    this.isHost = true
    this.mySlot = 0
    this._slots[0] = peerId

    this._peer.on('connection', (conn) => this._hostOnConn(conn))
    this._startHeartbeat()
    return code
  }

  _hostOnConn(conn) {
    let slot = -1
    for (let i = 1; i <= 3; i++) {
      if (!this._slots[i]) { slot = i; break }
    }
    if (slot === -1) {
      try { conn.send({ type: 'room_full' }) } catch (_) {}
      conn.close()
      return
    }
    this._conns[slot] = conn;

    conn.on('open', () => {
      this._slots[slot] = conn.peer
      this._lastPong[slot] = Date.now()
      conn.send({ type: 'assign_slot', slot, gameState: this._gameState || 'LOBBY' })
      window.dispatchEvent(new CustomEvent('room:player_join', {
        detail: { slot, playerId: conn.peer }
      }))
    });

    conn.on('data', (msg) => this._onData(msg, slot));
    conn.on('close', () => {
      delete this._conns[slot];
      delete this._slots[slot];
      window.dispatchEvent(new CustomEvent('room:player_leave', { detail: { slot } }));
    });
  }

  // ── Guest ──

  async joinRoom(code) {
    const upper  = code.trim().toUpperCase();
    const hostId = 'wy-' + upper.toLowerCase();

    this._peer = new Peer();
    await new Promise((resolve, reject) => {
      this._peer.on('open',  (id)  => { this.myId = id; resolve(); });
      this._peer.on('error', (err) => reject(new Error(err.type || String(err))));
    });

    const conn = this._peer.connect(hostId);
    await new Promise((resolve, reject) => {
      conn.on('open',  ()    => resolve());
      conn.on('error', (err) => reject(new Error('Could not reach host')));
      setTimeout(() => reject(new Error('Connection timed out')), 12000);
    });

    this.code      = upper;
    this._conns[0] = conn;   // slot 0 = host

    conn.on('data',  (msg) => this._onData(msg, 0))
    conn.on('close', () => this._handleDisconnect(0))
    this._lastPong[0] = Date.now()
    this._startHeartbeat()

    return upper
  }

  // ── Shared message handler ──

  _onData(msg, fromSlot) {
    if (!msg || !msg.type) return

    if (msg.type === 'ping') {
      const conn = this._conns[fromSlot]
      if (conn && conn.open) conn.send({ type: 'pong', t: msg.t })
      return
    }
    if (msg.type === 'pong') {
      this._lastPong[fromSlot] = Date.now()
      return
    }

    if (msg.type === 'assign_slot') {
      this.mySlot = msg.slot;
      this._slots[msg.slot] = this.myId;
      window.dispatchEvent(new CustomEvent('room:player_join', {
        detail: { slot: msg.slot, playerId: this.myId }
      }));
      if (msg.gameState && msg.gameState !== 'LOBBY') {
        window.dispatchEvent(new CustomEvent('room:state_change', {
          detail: { state: msg.gameState }
        }));
      }
    }

    if (msg.type === 'state') {
      window.dispatchEvent(new CustomEvent('room:state_change', { detail: { state: msg.state } }));
    }

    window.dispatchEvent(new CustomEvent('room:msg', {
      detail: { type: msg.type, payload: msg, from: fromSlot }
    }));

    // Host relays all messages to every other connection
    if (this.isHost) {
      for (const [slotStr, conn] of Object.entries(this._conns)) {
        if (Number(slotStr) !== fromSlot && conn.open) conn.send(msg);
      }
    }
  }

  // ── Heartbeat ──

  _startHeartbeat() {
    this._heartbeatId = setInterval(() => {
      const now = Date.now()
      for (const [slotStr, conn] of Object.entries(this._conns)) {
        const slot = Number(slotStr)
        if (!conn.open) continue
        conn.send({ type: 'ping', t: now })
        if (this._lastPong[slot] && now - this._lastPong[slot] > 6000) {
          this._handleDisconnect(slot)
        }
      }
    }, 2000)
  }

  _handleDisconnect(slot) {
    const conn = this._conns[slot]
    if (conn) { try { conn.close() } catch (_) {} }
    delete this._conns[slot]
    delete this._slots[slot]
    delete this._lastPong[slot]
    window.dispatchEvent(new CustomEvent('room:player_leave', { detail: { slot } }))
  }

  // ── Broadcast ──

  broadcast(type, data = {}) {
    const msg = { type, ...data };
    for (const conn of Object.values(this._conns)) {
      if (conn.open) conn.send(msg);
    }
  }

  broadcastState(state) { this.broadcast('state', { state }); }

  // ── Cleanup ──

  leave() {
    if (this._heartbeatId) { clearInterval(this._heartbeatId); this._heartbeatId = null }
    for (const conn of Object.values(this._conns)) {
      try { conn.close() } catch (_) {}
    }
    this._conns = {}
    if (this._peer) { try { this._peer.destroy() } catch (_) {}; this._peer = null }
  }

  setGameState(state) { this._gameState = state }

}
