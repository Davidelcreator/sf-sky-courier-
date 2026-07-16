// tools/npc_bake.js — one-time baker for the NPC recolor data.
//
//   node tools/npc_bake.js
//
// Reads every character GLB in assets/npcs/glb/ plus the pack's palette
// texture, and emits assets/npcs/npc-data.json with, for every vertex of
// every character:
//   role — 0 keep (head, skin, anything we must not touch)
//          1 top (shirt/jacket family)   2 bottom (pants family)
//          3 shoes
//   rgb  — the original palette color under that vertex's UV
// plus the mean luminance of each garment family, so the game can recolor
// a garment while PRESERVING its baked shading (folds, shadows):
//   newColor = archetypeColor × (vertexLuminance / familyMeanLuminance)
//
// Why offline? The classification needs the palette PNG's pixels and some
// statistics over all vertices — cheap here, wasteful to redo on every
// game load. Rerun this only if the character pack is updated.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const GLB_DIR = path.join(__dirname, '..', 'assets', 'npcs', 'glb');
const OUT = path.join(__dirname, '..', 'assets', 'npcs', 'npc-data.json');

// --- minimal PNG decode (the colormap is 8-bit palette-indexed) ---------
function decodePNG(file) {
  const b = fs.readFileSync(file);
  let off = 8, plte = null, idat = [], w, h;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.slice(off + 4, off + 8).toString('ascii');
    const data = b.slice(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    else if (type === 'PLTE') plte = data;
    else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h);
  let prev = Buffer.alloc(w);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w + 1)];
    const line = raw.slice(y * (w + 1) + 1, (y + 1) * (w + 1));
    const out = px.slice(y * w, (y + 1) * w);
    for (let x = 0; x < w; x++) {
      const a = x > 0 ? out[x - 1] : 0, up = prev[x], ul = x > 0 ? prev[x - 1] : 0;
      let v = line[x];
      if (f === 1) v = (v + a) & 255;
      else if (f === 2) v = (v + up) & 255;
      else if (f === 3) v = (v + ((a + up) >> 1)) & 255;
      else if (f === 4) {
        const p = a + up - ul, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - ul);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? up : ul)) & 255;
      }
      out[x] = v;
    }
    prev = out;
  }
  return { w, h, px, plte };
}

// --- minimal GLB reader --------------------------------------------------
function loadGLB(file) {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  return { json: JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8')),
           bin: buf.slice(20 + jsonLen + 8) };
}
function readAccessor(glb, idx) {
  const acc = glb.json.accessors[idx];
  const bv = glb.json.bufferViews[acc.bufferView];
  const compSize = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[acc.componentType];
  const nComp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = bv.byteStride || compSize * nComp;
  const out = [];
  for (let i = 0; i < acc.count; i++) {
    const v = [];
    for (let c = 0; c < nComp; c++) {
      const o = start + i * stride + c * compSize;
      v.push(acc.componentType === 5126 ? glb.bin.readFloatLE(o)
        : acc.componentType === 5123 ? glb.bin.readUInt16LE(o)
        : acc.componentType === 5125 ? glb.bin.readUInt32LE(o) : glb.bin[o]);
    }
    out.push(v);
  }
  return out;
}

// --- color helpers -------------------------------------------------------
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function hueSat([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: ((h * 60) + 360) % 360, s: mx === 0 ? 0 : d / mx };
}
// "Flesh family": warm colors matching a skin seed (skin seeds = colors
// used by BOTH meshes — the hands prove it's skin). Bare arms/legs use
// the same ramp, and must never be painted over by a garment recolor.
function makeFleshTest(seeds) {
  const seedHS = seeds.map(hueSat);
  return (rgb) => {
    const [r, g, b] = rgb;
    if (!(r > g && g >= b)) return false;            // must be warm
    const { h, s } = hueSat(rgb);
    return seedHS.some(sh => Math.abs(h - sh.h) < 16 && Math.abs(s - sh.s) < 0.28);
  };
}

const png = decodePNG(path.join(GLB_DIR, 'Textures', 'colormap.png'));
const texAt = (u, v) => {
  const x = Math.min(png.w - 1, Math.max(0, Math.floor(u * png.w)));
  const y = Math.min(png.h - 1, Math.max(0, Math.floor(v * png.h)));
  const i = png.px[y * png.w + x];
  return [png.plte[i * 3], png.plte[i * 3 + 1], png.plte[i * 3 + 2]];
};

const out = { generated: 'tools/npc_bake.js', chars: {} };
const files = fs.readdirSync(GLB_DIR).filter(f => /^character-.*\.glb$/.test(f)).sort();

// Pass 0: a GLOBAL skin-seed pool. All characters share one palette, so a
// skin ramp found on ANY character's hands+face protects bare skin on every
// character — including ones whose hands are gloved (no per-char seeds).
// Saturation cap keeps vivid yellow/orange garments out of the pool.
const seedPool = new Map();
const parsed = {};
for (const f of files) {
  const glb = loadGLB(path.join(GLB_DIR, f));
  const name = f.replace('.glb', '');
  const meshes = {};
  for (const mesh of glb.json.meshes) {
    if (mesh.primitives.length !== 1) throw new Error(name + '/' + mesh.name + ': expected 1 primitive');
    const prim = mesh.primitives[0];
    meshes[mesh.name] = {
      rgb: readAccessor(glb, prim.attributes.TEXCOORD_0).map(([u, v]) => texAt(u, v)),
      pos: readAccessor(glb, prim.attributes.POSITION),
    };
  }
  parsed[name] = meshes;
  const bodySet = new Set(meshes['body-mesh'].rgb.map(String));
  const headSet = new Set(meshes['head-mesh'].rgb.map(String));
  for (const k of bodySet) {
    if (!headSet.has(k)) continue;
    const rgb = k.split(',').map(Number);
    const [r, g, b] = rgb;
    if (r > g && g >= b && r - b >= 25 && hueSat(rgb).s <= 0.6) seedPool.set(k, rgb);
  }
}
const isFlesh = makeFleshTest([...seedPool.values()]);
console.log('global skin seeds:', [...seedPool.values()]
  .map(s => '#' + s.map(v => v.toString(16).padStart(2, '0')).join('')).join(' '), '\n');

for (const f of files) {
  const name = f.replace('.glb', '');
  const meshes = parsed[name];

  // Per-color average height on the body (bind pose) → garment bands.
  const body = meshes['body-mesh'];
  const byColor = {};
  body.rgb.forEach((rgb, i) => {
    const k = String(rgb);
    (byColor[k] = byColor[k] || { sumY: 0, n: 0 }).sumY += body.pos[i][1];
    byColor[k].n++;
  });
  const ys = Object.values(byColor).map(e => e.sumY / e.n);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const bandOf = (k) => {
    const e = byColor[k];
    const t = ((e.sumY / e.n) - minY) / (maxY - minY || 1);
    return t > 0.5 ? 1 : t > 0.16 ? 2 : 3; // top / bottom / shoes
  };

  // Pass 2: per-vertex roles + garment family mean luminance.
  const charOut = {};
  for (const [meshName, m] of Object.entries(meshes)) {
    const roles = new Uint8Array(m.rgb.length);
    const rgbFlat = new Uint8Array(m.rgb.length * 3);
    const lumSum = { 1: [0, 0], 2: [0, 0], 3: [0, 0] };
    m.rgb.forEach((rgb, i) => {
      rgbFlat.set(rgb, i * 3);
      let role = 0;                                 // heads are untouchable
      if (meshName === 'body-mesh' && !isFlesh(rgb)) role = bandOf(String(rgb));
      roles[i] = role;
      if (role) { lumSum[role][0] += lum(rgb); lumSum[role][1]++; }
    });
    charOut[meshName] = {
      roles: Buffer.from(roles).toString('base64'),
      rgb: Buffer.from(rgbFlat).toString('base64'),
      meanLum: Object.fromEntries(Object.entries(lumSum)
        .map(([r, [s, n]]) => [r, n ? +(s / n).toFixed(1) : 128])),
    };
  }
  out.chars[name] = charOut;

  const counts = [0, 0, 0, 0];
  for (const m of Object.values(meshes))
    m.rgb.forEach((rgb, i) => counts[(m === meshes['body-mesh'] && !isFlesh(rgb)) ? bandOf(String(rgb)) : 0]++);
  console.log(name.padEnd(20), 'verts keep/top/bottom/shoes =', counts.join('/'));
}

fs.writeFileSync(OUT, JSON.stringify(out));
console.log('\nwrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
