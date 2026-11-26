// Ridge Runner: posed, deterministic states for the screenshots, reached
// through ?shot=start|play|ring|land. Each pose is built by placing the
// plane and then stepping the flight model forward with fixed inputs, so the
// screenshot shows the game as it really plays — the same terrain, the same
// rings, the same HUD — never a composed frame.
import { CFG, START_POSE, MS_PER_KT } from './config.js';
import { stepFlight } from './flight.js';

function setPose(f, x, y, z, heading, pitch, roll, speedKts, throttle) {
  f.pose.x = x; f.pose.y = y; f.pose.z = z;
  f.pose.heading = heading; f.pose.pitch = pitch; f.pose.roll = roll;
  f.speedKts = speedKts; f.throttle = throttle;
  f.status = 'flying'; f.onGround = false; f.wasAirborne = true;
}

// Run the model forward with held inputs, so the pose settles naturally
// (a climb that is really climbing, a turn that is really banking).
function settle(f, heightAt, seconds, input) {
  const dt = 1 / 60;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) stepFlight(f, input, dt, heightAt);
}

export function applyShot(name, f, heightAt) {
  const idle = { throttleUp: false, throttleDown: false, airbrake: false,
    pitchUp: false, pitchDown: false, rollLeft: false, rollRight: false,
    yawLeft: false, yawRight: false, mousePitch: 0, mouseRoll: 0 };
  if (name === 'start') {
    // Parked on the threshold at dawn-light, engine idling, first ring ahead.
    f.pose.x = START_POSE.x; f.pose.y = heightAt(START_POSE.x, START_POSE.z) + 1.1;
    f.pose.z = START_POSE.z; f.pose.heading = 0; f.pose.pitch = 0; f.pose.roll = 0;
    f.speedKts = 0; f.throttle = 0.25; f.status = 'ready';
    f.onGround = true; f.time = 0; f.timeLeft = CFG.game.timeLimit;
    f.message = 'Halden Field — full throttle, then pull up gently.';
    f.messageAt = 0;
    return 'chase';
  }
  if (name === 'play') {
    // Mid-flight over Lake Mira, ring 2 dead ahead, climbing gently.
    // Heading 332 aims the nose at the ring (north-west across the lake).
    setPose(f, -480, 175, -160, 332, 6, -8, 118, 0.78);
    settle(f, heightAt, 1.6, { ...idle, throttleUp: false });
    f.message = 'Ring 2 of 8 — over Lake Mira.';
    f.messageAt = f.time;
    return 'chase';
  }
  if (name === 'ring') {
    // A heartbeat before threading ring 3 in the river gap, Mount Halden
    // rising behind it. Heading 341 aims the nose at the ring.
    setPose(f, -1020, 205, -880, 341, 2, 12, 132, 0.82);
    f.ringsHit = 2;
    settle(f, heightAt, 0.9, idle);
    f.message = 'Ring 3 of 8 — thread the gap!';
    f.messageAt = f.time;
    return 'chase';
  }
  if (name === 'land') {
    // Final approach: gear down, slow, the strip filling the windscreen.
    setPose(f, -260, 62, 1080, 0, -4, 0, 68, 0.3);
    f.ringsHit = 8; f.score = 8 * CFG.game.ringPoints;
    f.timeLeft = 182;
    settle(f, heightAt, 1.2, idle);
    f.message = 'Final — gear down, slow and steady onto the strip.';
    f.messageAt = f.time;
    return 'cockpit';
  }
  return null;
}
