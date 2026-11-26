// Ridge Runner: keyboard and mouse. Arrows / WASD pitch and roll, Q/E
// rudder, Shift/Ctrl throttle, Space airbrake, C camera, M mute, P pause,
// R restart, Enter start. Dragging with the mouse steers like a stick.
export function createInput(canvas) {
  const input = {
    pitchUp: false, pitchDown: false,
    rollLeft: false, rollRight: false,
    yawLeft: false, yawRight: false,
    throttleUp: false, throttleDown: false,
    airbrake: false,
    mousePitch: 0, mouseRoll: 0,
    throttleSet: null,
    // Edge-triggered actions, consumed by the main loop once.
    pressed: { start: false, restart: false, camera: false, pause: false, mute: false },
  };

  const keys = {};
  const KEYMAP = {
    ArrowUp: 'pitchUp', KeyW: 'pitchUp',
    ArrowDown: 'pitchDown', KeyS: 'pitchDown',
    ArrowLeft: 'rollLeft', KeyA: 'rollLeft',
    ArrowRight: 'rollRight', KeyD: 'rollRight',
    KeyQ: 'yawLeft', KeyE: 'yawRight',
    ShiftLeft: 'throttleUp', ShiftRight: 'throttleUp',
    ControlLeft: 'throttleDown', ControlRight: 'throttleDown',
    Space: 'airbrake',
  };

  function onKey(e, down) {
    if (KEYMAP[e.code] !== undefined) {
      input[KEYMAP[e.code]] = down;
      e.preventDefault();
    }
    if (down) {
      if (e.code === 'Enter') input.pressed.start = true;
      if (e.code === 'KeyR') input.pressed.restart = true;
      if (e.code === 'KeyC') input.pressed.camera = true;
      if (e.code === 'KeyP') input.pressed.pause = true;
      if (e.code === 'KeyM') input.pressed.mute = true;
    }
    keys[e.code] = down;
  }
  window.addEventListener('keydown', e => onKey(e, true));
  window.addEventListener('keyup', e => onKey(e, false));
  window.addEventListener('blur', () => {
    for (const k of Object.keys(KEYMAP)) input[KEYMAP[k]] = false;
    input.mousePitch = 0; input.mouseRoll = 0;
  });

  // Mouse steering: press and drag — the drag offset from the press point
  // becomes the stick deflection, easing back to centre on release.
  let dragging = false, startX = 0, startY = 0;
  canvas.addEventListener('pointerdown', e => {
    dragging = true; startX = e.clientX; startY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = (e.clientX - startX) / 160;
    const dy = (e.clientY - startY) / 160;
    input.mouseRoll = Math.max(-1, Math.min(1, dx));
    input.mousePitch = Math.max(-1, Math.min(1, -dy));
  });
  function endDrag() {
    dragging = false;
    input.mousePitch = 0; input.mouseRoll = 0;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  input.consume = function consume(name) {
    const v = input.pressed[name];
    input.pressed[name] = false;
    return v;
  };
  input.isDown = code => !!keys[code];
  return input;
}
