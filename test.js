const yaw = -30;
const pitch = 45;

const pitchRad = pitch * Math.PI / 180;
const yawRad = yaw * Math.PI / 180;
const r = 1000;

const y = r * Math.sin(pitchRad);
const r_xz = r * Math.cos(pitchRad);
const x = r_xz * Math.cos(yawRad);
const z = -r_xz * Math.sin(yawRad);

const yawBack = Math.atan2(-z, x) * (180 / Math.PI);
const pitchBack = Math.atan2(y, Math.sqrt(x * x + z * z)) * (180 / Math.PI);

console.log({yaw, pitch}, {yawBack, pitchBack}, {x, y, z});
