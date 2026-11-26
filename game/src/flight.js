// Ridge Runner: the flight model and the rules of the run. Arcade physics
// with honest bones — lift needs speed, climbs and turns cost speed, dives
// buy it back, and the ground always wins an argument.
import { CFG, MS_PER_KT, START_POSE } from './config.js';

const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function newFlight() {
  return {
    pose: {
      x: START_POSE.x, y: 28, z: START_POSE.z,
      heading: START_POSE.heading, pitch: 0, roll: 0,
    },
    speedKts: 0,
    throttle: 0,
    verticalSpeed: 0,
    onGround: true,
    wasAirborne: false,
    ringsHit: 0,
    score: 0,
    timeLeft: CFG.game.timeLimit,
    time: 0,
    status: 'ready', // ready | flying | crashed | landed | timeout
    message: '',
    messageAt: 0,
    lastRingAt: 0,
    propAngle: 0,
    best: 0,
  };
}

// Where each ring should be faced from: the course runs from the previous
// ring (or the runway for ring 0) to this one, so the ring's plane stands
// square to the pilot's approach.
export function ringYaw(rings, i) {
  const prev = i === 0 ? { x: START_POSE.x, z: START_POSE.z } : rings[i - 1];
  const dx = rings[i].x - prev.x, dz = rings[i].z - prev.z;
  return Math.atan2(-dx, -dz);
}

export function stepFlight(f, input, dt, heightAt) {
  const P = CFG.plane;
  const pose = f.pose;

  if (f.status === 'ready' || f.status === 'flying') {
    // Throttle: Shift up, Ctrl down, or the on-screen slider.
    if (input.throttleUp) f.throttle = clamp(f.throttle + dt * 0.55, 0, 1);
    if (input.throttleDown) f.throttle = clamp(f.throttle - dt * 0.55, 0, 1);
    if (typeof input.throttleSet === 'number') f.throttle = clamp(input.throttleSet, 0, 1);

    // Target speed from throttle: idling taxis, full power cruises at 150 kt.
    const targetKts = 8 + f.throttle * 165;
    let speed = f.speedKts;
    speed += clamp(targetKts - speed, -P.drag * dt * 22, P.accel * dt * 3.2);
    // Drag: turns and climbs bleed speed, dives buy it back.
    const turnBleed = Math.abs(pose.roll) / 45 * 6 * dt;
    const climbBleed = Math.max(0, pose.pitch) / 20 * 8 * dt;
    const diveGain = Math.max(0, -pose.pitch) / 20 * 10 * dt;
    speed = clamp(speed - turnBleed - climbBleed + diveGain, 0, P.maxKts + 25);

    // Controls: pitch and roll rates scale with speed (no authority parked).
    const authority = clamp((speed - 12) / 55, 0, 1);
    const pitchIn = (input.pitchUp ? 1 : 0) - (input.pitchDown ? 1 : 0) + (input.mousePitch || 0);
    const rollIn = (input.rollRight ? 1 : 0) - (input.rollLeft ? 1 : 0) + (input.mouseRoll || 0);
    const yawIn = (input.yawRight ? 1 : 0) - (input.yawLeft ? 1 : 0);
    pose.pitch = clamp(pose.pitch + pitchIn * P.pitchRate * authority * dt, -32, 32);
    pose.roll = clamp(pose.roll + rollIn * P.rollRate * authority * dt, -62, 62);
    // Level the wings when the stick is centred; the nose follows the pitch.
    if (rollIn === 0) pose.roll = lerp(pose.roll, 0, Math.min(1, dt * 1.4));
    if (pitchIn === 0) pose.pitch = lerp(pose.pitch, 0, Math.min(1, dt * 0.9));
    // A banked turn changes heading; the rudder yaws flat. Heading grows
    // clockwise (0 north, 90 east), so a right bank raises it.
    pose.heading = (pose.heading + pose.roll * 0.55 * dt + yawIn * P.yawRate * authority * dt + 360) % 360;

    // Stall: below the stall speed the nose drops and the plane sinks.
    const stalled = speed < P.stallKts && !f.onGround;
    if (stalled) pose.pitch = lerp(pose.pitch, -14, Math.min(1, dt * 2));

    // Move: forward along the nose, plus a sink rate when slow.
    const h = pose.heading * D2R, p = pose.pitch * D2R;
    const v = speed * MS_PER_KT;
    let vy = v * Math.sin(p);
    if (speed < P.stallKts && !f.onGround) vy -= (P.stallKts - speed) * MS_PER_KT * 0.4;
    if (input.airbrake) { vy -= 2.5; speed = Math.max(0, speed - 14 * dt); }
    pose.x += Math.sin(h) * Math.cos(p) * v * dt;
    pose.z += -Math.cos(h) * Math.cos(p) * v * dt;
    pose.y += vy * dt;
    f.verticalSpeed = vy;
    f.speedKts = speed;
    f.propAngle = (f.propAngle + (2 + f.throttle * 28) * dt) % (Math.PI * 2);

    // Ground handling: on the strip the plane rolls, it cannot sink below it.
    // A touchdown only counts when the plane was airborne a moment ago —
    // rolling down the runway for takeoff must not read as a landing.
    const ground = heightAt(pose.x, pose.z);
    const gearH = 1.1;
    if (pose.y <= ground + gearH) {
      // Rotating for takeoff: nose up, past rotation speed, climbing — the
      // wheels leave the strip instead of the ground clamp holding them.
      if (f.status === 'ready' && vy > 0.5 && speed > 55) {
        f.onGround = false;
        f.wasAirborne = true;
        f.status = 'flying';
        f.message = 'Airborne! Fly the rings, then land on the strip.';
        f.messageAt = f.time;
        pose.y = ground + gearH + 0.5;
      } else {
        pose.y = ground + gearH;
        f.onGround = true;
        if (f.status === 'flying' && f.wasAirborne && speed > 4) {
        // Touching down: a landing only counts on the runway, slow and level.
        if (isOnRunway(pose) && speed < 75 && Math.abs(pose.roll) < 14 && Math.abs(pose.pitch) < 10) {
          land(f);
        } else if (speed > 28) {
          crash(f, 'You came down hard off the strip.');
        } else {
          f.status = 'ready';
          f.message = 'Off the runway — press Enter to taxi back.';
          f.messageAt = f.time;
        }
      }
      f.wasAirborne = false;
      if (f.status === 'ready') {
        // Keep the nose level while taxiing slowly; past rotation speed the
        // pilot can pull up and lift off.
        if (speed < 30) pose.pitch = 0;
        if (speed < 2) pose.roll = 0;
      }
      }
    } else {
      f.onGround = false;
      f.wasAirborne = true;
      // A bounce over a bump at speed is not a takeoff: only leave the
      // ground for real when the nose is up and the wings are flying.
      if (f.status === 'ready' && speed > 58 && pose.pitch > 1) {
        f.status = 'flying';
        f.message = 'Airborne! Fly the rings, then land on the strip.';
        f.messageAt = f.time;
      }
    }

    // Terrain and water: the ground always wins.
    if (pose.y < ground + 0.6 && !f.onGround) crash(f, 'You flew into the mountainside.');
    if (pose.y < CFG.waterLevel + 0.6 && isOverLake(pose)) crash(f, 'You ditched in Lake Mira.');
    // Stay inside the valley; the edge pushes back gently.
    const edge = CFG.worldSize / 2 - 60;
    if (Math.abs(pose.x) > edge || Math.abs(pose.z) > edge) {
      pose.heading = (pose.heading + 180) % 360;
      f.message = 'Turn back — the valley ends here.';
      f.messageAt = f.time;
    }

    // Rings: crossing the ring's plane within its radius scores.
    if (f.status === 'flying' && f.ringsHit < CFG.rings.length) {
      const ring = CFG.rings[f.ringsHit];
      const dx = pose.x - ring.x, dy = pose.y - ring.y, dz = pose.z - ring.z;
      if (Math.hypot(dx, dy, dz) < ring.r * 0.92) {
        f.ringsHit++;
        f.score += CFG.game.ringPoints;
        f.lastRingAt = f.time;
        f.message = f.ringsHit === CFG.rings.length
          ? 'All rings! Bring her home to the runway.'
          : `Ring ${f.ringsHit} of ${CFG.rings.length} — nice flying!`;
        f.messageAt = f.time;
      }
    }

    if (f.status === 'flying' || f.status === 'ready') {
      f.time += dt;
      f.timeLeft = Math.max(0, CFG.game.timeLimit - f.time);
      if (f.timeLeft <= 0 && f.status !== 'landed') {
        f.status = 'timeout';
        f.message = 'Time up — the run is over.';
        f.messageAt = f.time;
      }
    }
  }
  return f;
}

function isOverLake(pose) {
  return Math.hypot(pose.x + 650, pose.z + 350) < 560;
}

export function isOnRunway(pose) {
  const rw = CFG.runway;
  // The strip runs north-south (along Z) from the threshold at z = 970.
  const along = pose.z - rw.z;
  const across = Math.abs(pose.x - rw.x);
  return Math.abs(along) < rw.length / 2 && across < rw.width / 2;
}

function crash(f, why) {
  if (f.status === 'crashed') return;
  f.status = 'crashed';
  f.message = why + ' Press R to try again.';
  f.messageAt = f.time;
  f.speedKts = 0;
}

function land(f) {
  if (f.status === 'landed') return;
  f.status = 'landed';
  const bonus = f.ringsHit === CFG.rings.length ? Math.round(f.timeLeft) : 0;
  f.score += CFG.game.landingPoints + bonus;
  f.message = f.ringsHit === CFG.rings.length
    ? `Touchdown! Mission complete — ${f.score} points.`
    : `Landed safely — ${f.score} points. Fly all 8 rings for the full run.`;
  f.messageAt = f.time;
  f.speedKts = 0;
  f.pose.pitch = 0; f.pose.roll = 0;
}
