// Ridge Runner — Alpine Ring Run: world and flight tuning, all in one place.
// Units: metres, seconds, degrees. Speeds shown to the player in knots / feet.
export const CFG = {
  seed: 20261126,
  worldSize: 4200, // the valley is this wide on each side, centred on 0,0
  terrainGrid: 128, // heightmap samples per side
  waterLevel: 2, // Lake Mira's surface
  gravity: 9.8,

  // Halden Field: a grass strip along +Z, centred near the south shore.
  runway: {
    x: -260, z: 620, heading: 0, // heading 0 = facing -Z... see runwayDir
    length: 700, width: 46,
  },

  // The ring course: eight glowing rings across the valley, in order. The
  // course threads the lake and the river gap, then circles Mount Halden
  // around its west shoulder and across its north face — never through it:
  // every leg keeps at least 40 m of air under the rings' altitudes.
  rings: [
    { x: -260, y: 95, z: 120, r: 36 }, // just off the runway, climb-out
    { x: -620, y: 150, z: -420, r: 36 }, // over Lake Mira
    { x: -1080, y: 210, z: -1050, r: 38 }, // river gap, west ridge
    { x: -800, y: 360, z: -1600, r: 38 }, // around the peak's west shoulder
    { x: 200, y: 400, z: -1950, r: 38 }, // across the peak's north face, clear of its skirt
    { x: 950, y: 170, z: -480, r: 36 }, // over Mira Falls hamlet
    { x: 700, y: 120, z: 320, r: 36 }, // back across the lake's east arm
    { x: 60, y: 90, z: 620, r: 36 }, // final, on the runway centreline
  ],

  plane: {
    stallKts: 55,
    maxKts: 185,
    cruiseThrottle: 0.72,
    climbRate: 9, // m/s at full power, level
    rollRate: 95, // deg/s at full deflection
    pitchRate: 55,
    yawRate: 22,
    accel: 7, // m/s^2 towards target speed
    drag: 0.9,
  },

  game: {
    timeLimit: 360, // seconds
    ringPoints: 100,
    landingPoints: 500,
  },
};

// The runway runs north-south: taking off towards -Z (heading 0 = north).
export const RUNWAY_DIR = { x: 0, z: -1 };

// Start pose: parked on the runway threshold, facing north, engine idling.
export const START_POSE = {
  x: -260, z: 940, heading: 0, pitch: 0, roll: 0, speedKts: 0, throttle: 0,
};

export const MS_PER_KT = 0.514444;
export const M_PER_FT = 0.3048;
