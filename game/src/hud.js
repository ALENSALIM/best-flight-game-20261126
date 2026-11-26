// Ridge Runner: the HUD — a DOM overlay over the WebGL canvas, plus the
// start / pause / end screens. All readouts are plain text so they stay
// crisp in the screenshots, and the artificial horizon is a small 2D canvas.
import { CFG, MS_PER_KT, M_PER_FT } from './config.js';

const $ = id => document.getElementById(id);

export function createHud() {
  const els = {
    alt: $('hud-alt'), spd: $('hud-spd'), hdg: $('hud-hdg'),
    vs: $('hud-vs'), thr: $('hud-thr'), score: $('hud-score'),
    rings: $('hud-rings'), time: $('hud-time'),
    msg: $('hud-msg'), beacon: $('hud-beacon'),
    screen: $('screen'), screenTitle: $('screen-title'),
    screenBody: $('screen-body'), screenHint: $('screen-hint'),
    horizon: $('horizon'), panel: $('panel'),
  };
  const hctx = els.horizon.getContext('2d');
  let lastMsgAt = -1;

  function fmtTime(s) {
    const m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, '0')}`;
  }

  function drawHorizon(pose) {
    const c = hctx, W = 150, H = 150;
    c.save();
    c.beginPath(); c.arc(W / 2, H / 2, 70, 0, Math.PI * 2); c.clip();
    c.translate(W / 2, H / 2);
    c.rotate(-pose.roll * Math.PI / 180);
    c.translate(0, pose.pitch * 2.2);
    c.fillStyle = '#3f7fd0'; c.fillRect(-90, -90, 180, 90); // sky
    c.fillStyle = '#7a5230'; c.fillRect(-90, 0, 180, 90); // ground
    c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-90, 0); c.lineTo(90, 0); c.stroke();
    c.restore();
    // Fixed wings marker and bezel.
    c.strokeStyle = '#ffd34d'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(W / 2 - 42, H / 2); c.lineTo(W / 2 - 14, H / 2); c.stroke();
    c.beginPath(); c.moveTo(W / 2 + 14, H / 2); c.lineTo(W / 2 + 42, H / 2); c.stroke();
    c.fillStyle = '#ffd34d';
    c.beginPath(); c.arc(W / 2, H / 2, 4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#dfe8f2'; c.lineWidth = 4;
    c.beginPath(); c.arc(W / 2, H / 2, 72, 0, Math.PI * 2); c.stroke();
  }

  function compassStrip(heading) {
    const pts = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    let best = pts[0], bd = 360;
    for (const p of pts) {
      const d = Math.min(Math.abs(heading - p[0]), 360 - Math.abs(heading - p[0]));
      if (d < bd) { bd = d; best = p; }
    }
    return best[1];
  }

  return {
    update(f, pose, nextRing, distToRing, view) {
      const altFt = Math.round((pose.y - 26) / M_PER_FT);
      els.alt.textContent = `${Math.max(0, altFt).toLocaleString('en-US')} ft`;
      els.spd.textContent = `${Math.round(f.speedKts)} kt`;
      const hdg = Math.round(((pose.heading % 360) + 360) % 360);
      els.hdg.textContent = `${String(hdg).padStart(3, '0')}° ${compassStrip(hdg)}`;
      const vs = Math.round(f.verticalSpeed / M_PER_FT * 60);
      els.vs.textContent = `${vs >= 0 ? '+' : ''}${vs} fpm`;
      els.thr.textContent = `${Math.round(f.throttle * 100)}%`;
      els.score.textContent = String(f.score);
      els.rings.textContent = `${f.ringsHit}/${CFG.rings.length}`;
      els.time.textContent = fmtTime(f.timeLeft);
      els.time.classList.toggle('low', f.timeLeft < 60);
      if (nextRing && f.status === 'flying') {
        els.beacon.textContent = `◉ Ring ${f.ringsHit + 1} — ${Math.round(distToRing)} m`;
        els.beacon.style.display = 'block';
      } else if (f.status === 'landed' || f.status === 'crashed' || f.status === 'timeout') {
        els.beacon.style.display = 'none';
      } else if (f.status === 'ready') {
        els.beacon.textContent = '▲ Full throttle, pull up gently to lift off';
        els.beacon.style.display = 'block';
      }
      if (f.message && f.messageAt !== lastMsgAt) {
        els.msg.textContent = f.message;
        els.msg.classList.add('show');
        lastMsgAt = f.messageAt;
        clearTimeout(this._msgTimer);
        this._msgTimer = setTimeout(() => els.msg.classList.remove('show'), 5200);
      }
      drawHorizon(pose);
      els.panel.style.display = view === 'cockpit' ? 'flex' : 'none';
    },

    showScreen(title, body, hint) {
      els.screenTitle.textContent = title;
      els.screenBody.innerHTML = body;
      els.screenHint.textContent = hint;
      els.screen.classList.remove('hidden');
    },
    hideScreen() { els.screen.classList.add('hidden'); },
  };
}
