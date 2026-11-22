const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const camera = fs.readFileSync(path.join(root, 'src/components/CameraScanner.tsx'), 'utf8');
const control = fs.readFileSync(path.join(root, 'src/views/Control.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'server/src/app.js'), 'utf8');

test('camera scanner is a real getUserMedia scanner, not a visual simulation', () => {
  assert.match(camera, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(camera, /facingMode:\s*\{\s*ideal:\s*"environment"\s*\}/);
  assert.match(camera, /requestAnimationFrame/);
  assert.match(camera, /now - lastScanAt >= 150/);
  assert.match(camera, /jsQR\(/);
  assert.match(camera, /BarcodeDetector/);
  assert.match(camera, /stream\.getTracks\(\)\.forEach\(track => track\.stop\(\)/);
});

test('control screen launches camera scanner and resolves code/serial to a permitted equipment', () => {
  assert.match(control, /<CameraScanner/);
  assert.match(control, /setCameraOpen\(true\)/);
  assert.match(control, /x\.serial && x\.serial\.trim\(\)\.toLocaleLowerCase\(\) === normalized/);
  assert.match(control, /userGroupVisible\(user, e\.groupId\)/);
  assert.match(control, /payload\.equipmentCode \|\| payload\.assetCode/);
});

test('hardware barcode reader is supported through keyboard wedge and Enter suffix', () => {
  assert.match(control, /e\.key === "Enter"/);
  assert.match(control, /پسوند اسکن دستگاه را روی Enter تنظیم کنید/);
});

test('camera endpoint relies on secure HTTPS deployment', () => {
  assert.match(camera, /window\.isSecureContext/);
  assert.match(app, /origin\.protocol !== 'https:'/);
});

test('native BarcodeDetector runtime failures fall back to the local QR decoder', () => {
  assert.match(camera, /catch \{[\s\S]*?detector = null;[\s\S]*?setFormats\(\[\"qr_code\"\]\);/);
  assert.match(camera, /اسکن QR با موتور جایگزین ادامه دارد/);
});
