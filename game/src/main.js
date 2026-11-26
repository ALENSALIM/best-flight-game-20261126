// Ridge Runner — Alpine Ring Run: bootstrap, the game loop and the cameras.
// The world is built once from the seed; each frame steps the flight model,
// moves the chase or cockpit camera, renders the scene and refreshes the HUD.
import { CFG } from './config.js';
import { makeHeightAt, buildTerrain, buildRunway, buildWater, scatterLandmarks, makeClouds } from './terrain.js';
import { Renderer, planeBasis } from './render.js';
import { newFlight, stepFlight, ringYaw } from './flight.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('gl');
const hud = createHud();
const input = createInput(canvas);
const audio = createAudio();
const params = new URLSearchParams(location.search);
const shotName = params.get('shot');

const heightAt = makeHeightAt();
const world = {
  terrain: buildTerrain(heightAt),
  runway: buildRunway(heightAt),
  water: buildWater(),
  landmarks: scatterLandmarks(heightAt),
  clouds: makeClouds(),
};
const renderer = new Renderer(canvas, world);

const flight = newFlight();
flight.best = Number(localStorage.getItem('ridge-runner-best') || 0);
const ringYaws = CFG.rings.map((r, i) => ringYaw(CFG.rings, i));

let view = 'chase';
let paused = false;
let started = false; // the player has pressed Enter / clicked to fly
let shotView = null;
let chimedRings = 0; // rings already chimed for, so each ring chimes once
let cloudDrift = 0;
const cam = { eye: [0, 60, 1050], target: [-260, 28, 940] };
let last = performance.now();
let fpsFrames = 0, fpsAt = last;

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.round(w * window.devicePixelRatio);
  canvas.height = Math.round(h * window.devicePixelRatio);
}
window.addEventListener('resize', resize);
resize();

// The start screen: title, the course, the controls. The game idles behind
// it on the runway so the first frame is already a postcard.
function startScreen() {
  return {
    title: 'RIDGE RUNNER',
    body: `<p class="sub">Alpine Ring Run &middot; Halden Field</p>
      <p>Fly the Skyfox through all <b>8 rings</b> over Lake Mira and around
      Mount Halden, then bring her home to the grass strip. A clean landing
      after all eight rings is worth <b>500 points</b>, plus a second for every
      second left on the clock.</p>
      <p class="controls">
      <b>W/S</b> or <b>&uarr;/&darr;</b> pitch &nbsp;&middot;&nbsp;
      <b>A/D</b> or <b>&larr;/&rarr;</b> roll &nbsp;&middot;&nbsp;
      <b>Q/E</b> rudder<br>
      <b>Shift</b> throttle up &nbsp;&middot;&nbsp; <b>Ctrl</b> throttle down
      &nbsp;&middot;&nbsp; <b>Space</b> airbrake<br>
      Drag with the mouse to steer &nbsp;&middot;&nbsp; <b>C</b> camera
      &nbsp;&middot;&nbsp; <b>P</b> pause &nbsp;&middot;&nbsp; <b>M</b> sound
      &nbsp;&middot;&nbsp; <b>R</b> restart</p>
      <p class="best">${flight.best > 0 ? `Best score: ${flight.best}` : 'First flight? Full throttle, then pull up gently.'}</p>`,
    hint: 'Press Enter or click to fly',
  };
}

function endScreen() {
  const f = flight;
  const title = f.status === 'landed' ? 'MISSION COMPLETE'
    : f.status === 'crashed' ? 'CRASHED'
    : f.status === 'timeout' ? 'TIME UP' : 'RUN OVER';
  const best = Math.max(f.best, f.score);
  const body = `<p class="big">${f.score} points &middot; ${f.ringsHit} of ${CFG.rings.length} rings</p>
    <p>${f.message}</p>
    <p class="best">${f.score >= best && f.score > 0 ? 'A new best score!' : `Best score: ${best}`}</p>`;
  return { title, body, hint: 'Press R to fly again' };
}

function showStart() { const s = startScreen(); hud.showScreen(s.title, s.body, s.hint); }
function showEnd() { const s = endScreen(); hud.showScreen(s.title, s.body, s.hint); }

function reset() {
  const keepBest = flight.best;
  Object.assign(flight, newFlight());
  flight.best = keepBest;
  chimedRings = 0;
  started = false;
  paused = false;
  hud.hideScreen();
  showStart();
}

// Camera: chase sits behind and above the plane, easing after it; cockpit
// sits at the pilot's head and looks straight down the nose.
function updateCamera(dt) {
  const pose = flight.pose;
  const { fwd, up } = planeBasis(pose.heading, pose.pitch, pose.roll);
  if (view === 'cockpit') {
    cam.eye = [pose.x + fwd[0] * 1.2 + up[0] * 0.75, pose.y + fwd[1] * 1.2 + up[1] * 0.75, pose.z + fwd[2] * 1.2 + up[2] * 0.75];
    cam.target = [pose.x + fwd[0] * 60, pose.y + fwd[1] * 60, pose.z + fwd[2] * 60];
    return;
  }
  const dist = 13, height = 4.2;
  const want = [
    pose.x - fwd[0] * dist + up[0] * height,
    pose.y - fwd[1] * dist + up[1] * height,
    pose.z - fwd[2] * dist + up[2] * height,
  ];
  const k = Math.min(1, dt * 5);
  for (let i = 0; i < 3; i++) cam.eye[i] += (want[i] - cam.eye[i]) * k;
  // Never let the camera sink into a hillside.
  const minY = heightAt(cam.eye[0], cam.eye[2]) + 2.2;
  if (cam.eye[1] < minY) cam.eye[1] = minY;
  cam.target = [pose.x + fwd[0] * 14, pose.y + fwd[1] * 14 + 1, pose.z + fwd[2] * 14];
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsFrames++;
  if (now - fpsAt > 2000) { fpsFrames = 0; fpsAt = now; }

  // One-shot actions.
  if (input.consume('restart')) { audio.click(); reset(); }
  if (input.consume('camera')) { view = view === 'chase' ? 'cockpit' : 'chase'; }
  if (input.consume('pause') && started) { paused = !paused; }
  if (input.consume('mute')) { audio.setMuted(!audio.isMuted()); }
  if (input.consume('start') && !started) {
    audio.unlock(); audio.click();
    started = true;
    hud.hideScreen();
    flight.message = 'Full throttle — Shift to spool up, then pull up gently.';
    flight.messageAt = flight.time;
  }

  // A posed screenshot freezes the run: the pose is fixed, so the shot is
  // one real frame of the running game, not a moment that flies past.
  const frozen = !!shotName;
  if (!paused && started && !frozen) {
    stepFlight(flight, input, dt, heightAt);
    if (flight.ringsHit > chimedRings) { chimedRings = flight.ringsHit; audio.ring(); }
    if (flight.status === 'landed' || flight.status === 'crashed' || flight.status === 'timeout') {
      if (flight.score > flight.best) {
        flight.best = flight.score;
        localStorage.setItem('ridge-runner-best', String(flight.best));
      }
      if (flight.status === 'landed') audio.land();
      if (flight.status === 'crashed') audio.crash();
      started = false;
      showEnd();
    }
  }
  if (!paused) {
    audio.update(flight.throttle, flight.speedKts, flight.onGround);
    cloudDrift += dt * 2.2;
  }
  updateCamera(dt);

  const nextRing = flight.ringsHit < CFG.rings.length ? CFG.rings[flight.ringsHit] : null;
  const distToRing = nextRing
    ? Math.hypot(flight.pose.x - nextRing.x, flight.pose.y - nextRing.y, flight.pose.z - nextRing.z)
    : 0;
  renderer.render({
    pose: flight.pose,
    ringsHit: flight.ringsHit,
    time: flight.time,
    view,
    propAngle: flight.propAngle,
    cloudDrift,
    ringYaw: ringYaws,
  }, cam);
  hud.update(flight, flight.pose, nextRing, distToRing, view);
}

// Clicking the canvas also starts the run (and unlocks audio).
canvas.addEventListener('pointerdown', () => {
  if (!started) {
    audio.unlock(); audio.click();
    started = true;
    hud.hideScreen();
  }
});

// A posed screenshot: place the plane, freeze the run, render one frame.
// The game keeps rendering behind it, but the pose is fixed, so the shot is
// a real frame of the running game.
if (shotName) {
  shotView = applyShot(shotName, flight, heightAt);
  if (shotView) view = shotView;
  started = true;
  flight.messageAt = flight.time;
  hud.hideScreen();
  document.title = `Ridge Runner — shot ${shotName}`;
} else {
  showStart();
}

requestAnimationFrame(frame);
