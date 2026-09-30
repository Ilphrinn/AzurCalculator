// Pixel-art rendering, ported from the ilph-creation.party hub: the animated field behind the
// header, and Bayer-dithered stand-ins for the app's smooth gradients. Kept as its own classic
// script because the CSP only allows same-origin scripts.
(() => {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const CELL = 4;
  const threshold = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  // Accepts the forms getComputedStyle hands back for this app's tokens: hex, rgb() or rgba().
  function parseColor(value) {
    const v = value.trim();
    if (v === "transparent") return [0, 0, 0, 0];
    if (v[0] === "#") {
      const hex = v.length === 4 ? [...v.slice(1)].map(c => c + c).join("") : v.slice(1, 7);
      return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).concat(255);
    }
    const n = v.match(/[\d.]+/g) || [0, 0, 0];
    return [+n[0], +n[1], +n[2], n[3] === undefined ? 255 : Math.round(+n[3] * 255)];
  }

  const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));

  // Flat colour levels sampled along the stops ([rgba, position 0..1]); dithering then picks
  // between two neighbouring levels, which gives banding with stippled edges rather than a blend.
  function buildRamp(stops, levels) {
    return Array.from({ length: levels }, (_, i) => {
      const t = i / (levels - 1);
      let k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][1]) k++;
      const [ca, pa] = stops[k];
      const [cb, pb] = stops[k + 1];
      return mix(ca, cb, Math.min(1, Math.max(0, (t - pa) / (pb - pa || 1))));
    });
  }

  // The PNG is encoded by hand instead of read back from a canvas: browsers that resist
  // fingerprinting (LibreWolf, Firefox with resistFingerprinting) answer toDataURL() with random
  // pixels, which turned every dithered gradient into coloured noise.
  const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });

  function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }

  // Uncompressed deflate blocks in a zlib wrapper, for browsers without CompressionStream.
  function zlibStored(raw) {
    const blocks = Math.max(1, Math.ceil(raw.length / 65535));
    const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
    out[0] = 0x78;
    out[1] = 0x01;
    let o = 2;
    for (let i = 0; i < blocks; i++) {
      const part = raw.subarray(i * 65535, (i + 1) * 65535);
      out[o] = i === blocks - 1 ? 1 : 0;
      out[o + 1] = part.length & 255;
      out[o + 2] = part.length >>> 8;
      out[o + 3] = ~part.length & 255;
      out[o + 4] = (~part.length >>> 8) & 255;
      out.set(part, o + 5);
      o += 5 + part.length;
    }
    let a = 1;
    let b = 0;
    for (const v of raw) {
      a = (a + v) % 65521;
      b = (b + a) % 65521;
    }
    new DataView(out.buffer).setUint32(o, ((b << 16) | a) >>> 0);
    return out;
  }

  async function zlib(raw) {
    if (typeof CompressionStream === "undefined") return zlibStored(raw);
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // An 8-bit palette PNG: a ramp never has more than a handful of levels, and tRNS carries alpha.
  async function encodePng(cols, rows, scanlines, ramp) {
    const header = new Uint8Array(13);
    const view = new DataView(header.buffer);
    view.setUint32(0, cols);
    view.setUint32(4, rows);
    header[8] = 8;
    header[9] = 3;
    const palette = new Uint8Array(ramp.length * 3);
    const alpha = new Uint8Array(ramp.length);
    ramp.forEach((c, i) => {
      palette.set(c.slice(0, 3), i * 3);
      alpha[i] = c[3];
    });
    const parts = [
      PNG_SIGNATURE,
      pngChunk("IHDR", header),
      pngChunk("PLTE", palette),
      pngChunk("tRNS", alpha),
      pngChunk("IDAT", await zlib(scanlines)),
      pngChunk("IEND", new Uint8Array(0))
    ];
    let binary = "";
    for (const part of parts) {
      for (let i = 0; i < part.length; i += 0x8000) binary += String.fromCharCode(...part.subarray(i, i + 0x8000));
    }
    return `data:image/png;base64,${btoa(binary)}`;
  }

  async function renderDither(width, height, ramp, tAt) {
    const cols = Math.max(1, Math.ceil(width / CELL));
    const rows = Math.max(1, Math.ceil(height / CELL));
    const scanlines = new Uint8Array(rows * (cols + 1));
    const n = ramp.length - 1;
    for (let y = 0; y < rows; y++) {
      const row = y * (cols + 1);
      for (let x = 0; x < cols; x++) {
        const v = Math.min(1, Math.max(0, tAt((x + 0.5) * CELL, (y + 0.5) * CELL))) * n;
        const base = Math.floor(v);
        scanlines[row + 1 + x] = Math.min(n, base + (v - base > threshold(x, y) ? 1 : 0));
      }
    }
    const png = await encodePng(cols, rows, scanlines, ramp);
    return { url: `url("${png}")`, size: `${cols * CELL}px ${rows * CELL}px` };
  }

  // The same geometry as a CSS linear-gradient(<angle>deg, ...), so the dithered version lines up
  // with the smooth fallback it replaces.
  function linearT(width, height, degrees) {
    const a = (degrees * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const length = Math.abs(width * dx) + Math.abs(height * dy);
    return (x, y) => ((x - width / 2) * dx + (y - height / 2) * dy) / length + 0.5;
  }

  // Paints `el`'s dithered background into --<name>/--<name>-size, which the stylesheet reads with
  // a smooth gradient as the fallback. Names are per target because custom properties inherit.
  function ditherBackground(el, name, spec) {
    let size = null;
    let latest = 0;
    const paint = async () => {
      if (!size || !size[0] || !size[1]) return;
      const job = ++latest;
      const { ramp, tAt } = spec(size[0], size[1]);
      const { url, size: px } = await renderDither(size[0], size[1], ramp, tAt);
      // Encoding is async, so a resize or recolour started meanwhile must win over this one.
      if (job !== latest) return;
      el.style.setProperty(`--${name}`, url);
      el.style.setProperty(`--${name}-size`, px);
    };
    // ResizeObserver reports the size without forcing a reflow, unlike reading clientWidth.
    new ResizeObserver(([entry]) => {
      const box = entry.borderBoxSize[0];
      size = [box.inlineSize, box.blockSize];
      paint();
    }).observe(el);
    return paint;
  }

  const token = (el, name) => el && getComputedStyle(el).getPropertyValue(name).trim();

  const modal = document.querySelector(".modal");
  const modalInfo = document.querySelector(".modal-info");
  const modalHeading = document.querySelector(".modal-heading");

  if (modal && modalInfo && modalHeading) {
    const repaintInfo = ditherBackground(modalInfo, "dither-info", (w, h) => {
      const card = parseColor(token(modal, "--card-bg"));
      const rarity = parseColor(token(modal, "--modal-rarity-color") || token(modal, "--border"));
      return { ramp: buildRamp([[mix(card, rarity, 0.55), 0], [card, 0.95], [card, 1]], 7), tAt: linearT(w, h, 165) };
    });
    const repaintHeading = ditherBackground(modalHeading, "dither-heading", (w, h) => {
      const card = parseColor(token(modal, "--card-bg"));
      const nation = parseColor(token(modal, "--modal-nation-color") || token(modal, "--border"));
      return { ramp: buildRamp([[card, 0], [mix(card, nation, 0.55), 1]], 6), tAt: linearT(w, h, 90) };
    });
    // app.js swaps the rarity and nation colours by rewriting the modal's inline custom properties.
    new MutationObserver(() => {
      repaintInfo();
      repaintHeading();
    }).observe(modal, { attributes: true, attributeFilter: ["style"] });
  }

  const topbar = document.querySelector(".topbar");
  if (topbar) {
    ditherBackground(topbar, "dither-topbar", (w, h) => {
      const bg = parseColor(token(topbar, "--bg"));
      return {
        ramp: buildRamp([[[6, 10, 20, 224], 0], [[11, 17, 32, 245], 0.75], [bg, 1]], 5),
        tAt: linearT(w, h, 180)
      };
    });
  }

  // The page halo is fixed to the viewport, so it is sized from the window rather than an element.
  const root = document.documentElement;
  let haloFrame = 0;
  let haloJob = 0;
  const paintHalo = async () => {
    haloFrame = 0;
    const job = ++haloJob;
    const w = innerWidth;
    const h = innerHeight;
    const accent = parseColor(token(root, "--accent"));
    const ramp = buildRamp([[[...accent.slice(0, 3), 26], 0], [[...accent.slice(0, 3), 0], 0.7], [[0, 0, 0, 0], 1]], 5);
    const { url, size } = await renderDither(w, h, ramp, (x, y) => Math.hypot((x - 0.7 * w) / (0.8 * w), y / (0.5 * h)));
    if (job !== haloJob) return;
    root.style.setProperty("--dither-halo", url);
    root.style.setProperty("--dither-halo-size", size);
  };
  haloFrame = requestAnimationFrame(paintHalo);
  addEventListener("resize", () => {
    if (!haloFrame) haloFrame = requestAnimationFrame(paintHalo);
  });

  const field = document.getElementById("field");
  if (!field) return;
  const PALETTE = [null, "#12304a", "#2b86b8", "#4fc3f7"].map(c => c && parseColor(c));
  const fieldCtx = field.getContext("2d");
  let cols, rows, image;

  // An aircraft carrier sailing left, one "x" per 4px cell. It is shaded only in the sea's own
  // blues, so it still reads as part of the scene rather than a separate object.
  const SHIP = [
    ".....................................x................",
    ".....................................x................",
    "....................................xxx.xx............",
    "...................................xxxxxxx............",
    "..................................xxxxxxxx............",
    "............x...........x.........xxxxxxxx.....x......",
    "..........xxxxx.......xxxxx......xxxxxxxxxx..xxxxx....",
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx..",
    "...xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx....",
    ".....xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.....",
    "........xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx......."
  ];
  const SHIP_WIDTH = SHIP[0].length;
  const SHIP_HEIGHT = SHIP.length;
  const FLIGHT_DECK = 7;
  const [HIGHLIGHT, FACE, SHADE, DEEP] = ["#8fd8fb", "#4fc3f7", "#2b86b8", "#1b5f88"].map(parseColor);
  const filled = (dx, dy) => SHIP[dy] !== undefined && SHIP[dy][dx] === "x";
  // Lit from the upper left: bright top edges, darker right-hand faces, a line of shadow under
  // the overhanging flight deck, then a lit hull side that only darkens, through the dither, at
  // the waterline - a dark hull would vanish into the dark sea right below it.
  const SHIP_SHADING = SHIP.map((row, dy) => [...row].map((cell, dx) => {
    if (cell !== "x") return null;
    if (!filled(dx, dy - 1)) return HIGHLIGHT;
    if (dy <= FLIGHT_DECK) return filled(dx + 1, dy) ? FACE : SHADE;
    if (dy === FLIGHT_DECK + 1) return SHADE;
    if (dy < SHIP_HEIGHT - 1) return filled(dx - 1, dy) ? FACE : SHADE;
    return threshold(dx, dy) < 0.5 ? SHADE : DEEP;
  }));
  const KEEL = [...SHIP[0]].map((_, dx) => {
    let dy = SHIP_HEIGHT - 1;
    while (dy >= 0 && !filled(dx, dy)) dy--;
    return dy;
  });
  // Where the island's funnel tops out, for the smoke.
  const FUNNEL = [40, 1];
  const SMOKE = PALETTE[2];
  const FOAM = parseColor("#cfe8ff");
  // The sea starts below this row, leaving the strip behind the title clear as sky.
  const HORIZON = 15;
  const noise = (a, b) => {
    const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };

  const resize = (width, height) => {
    cols = Math.max(1, Math.ceil(width / CELL));
    rows = Math.max(1, Math.ceil(height / CELL));
    field.width = cols;
    field.height = rows;
    image = fieldCtx.createImageData(cols, rows);
  };

  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    const o = (y * cols + x) * 4;
    image.data[o] = c[0];
    image.data[o + 1] = c[1];
    image.data[o + 2] = c[2];
    image.data[o + 3] = 255;
  };

  // Swell: crest lines packed tight near the horizon and spreading towards the viewer, which is
  // what reads as perspective; each band wobbles sideways and rolls downwards over time.
  const drawSea = t => {
    const p = image.data;
    const n = PALETTE.length - 1;
    const span = Math.max(1, rows - HORIZON);
    p.fill(0);
    for (let y = HORIZON; y < rows; y++) {
      const depth = (y - HORIZON) / span;
      // Steep enough to fade out in dithered steps on its own, with no smooth CSS mask on top.
      const fade = Math.pow(1 - depth, 1.8);
      const near = Math.sqrt(depth);
      for (let x = 0; x < cols; x++) {
        const phase = near * 22 - t * 1.1 +
          (0.5 + near) * (1.4 * Math.sin(x * 0.03 + t * 0.35) + 0.5 * Math.sin(x * 0.11 - t * 0.9));
        const crest = Math.pow(0.5 + 0.5 * Math.sin(phase), 3);
        // Denser towards the right, so the title and filters on the left stay readable.
        const v = Math.max(0, Math.min(1, (0.12 + 0.88 * crest) * fade * (0.25 + 0.85 * x / cols))) * n;
        const base = Math.floor(v);
        const c = PALETTE[Math.min(n, base + (v - base > threshold(x, y) ? 1 : 0))];
        if (c) put(x, y, c);
      }
    }
  };

  // Only where the header is wide enough for the ship to sit clear of the title and controls.
  const drawShip = t => {
    if (cols < 220) return;
    const left = Math.min(cols - SHIP_WIDTH - 16, Math.round(cols * 0.74 - SHIP_WIDTH / 2));
    const top = HORIZON + 1 - (SHIP_HEIGHT - 1) + Math.round(Math.sin(t * 0.5) * 0.6);

    // Reflection first, so the hull covers its top: the ship mirrored under the keel, broken up
    // by a ripple that drifts sideways and thinning out through the dither with depth.
    for (let k = 1; k <= 6; k++) {
      const shift = Math.round(Math.sin(k * 1.1 - t * 2.4) * (k / 6) * 1.6);
      for (let dx = 0; dx < SHIP_WIDTH; dx++) {
        if (KEEL[dx] < 0 || !filled(dx, KEEL[dx] - k + 1)) continue;
        const x = left + dx + shift;
        const y = top + KEEL[dx] + k;
        if (threshold(x, y) < 0.6 * (1 - k / 7)) put(x, y, SHADE);
      }
    }

    SHIP_SHADING.forEach((row, dy) => row.forEach((c, dx) => {
      if (c) put(left + dx, top + dy, c);
    }));

    // Smoke drifts astern from the funnel and thins out through the dither as it ages.
    for (let i = 0; i < 7; i++) {
      const age = (t * 0.35 + i / 7) % 1;
      const size = age < 0.4 ? 1 : 2;
      const sx = left + FUNNEL[0] + Math.round(age * 10);
      const sy = top + FUNNEL[1] - Math.round(age * 5);
      for (let oy = 0; oy < size; oy++) {
        for (let ox = 0; ox < size; ox++) {
          if (threshold(sx + ox, sy + oy) < (1 - age) * 0.9) put(sx + ox, sy - oy, SMOKE);
        }
      }
    }
    // Wake behind the stern and a bow wave, flickering a few times a second.
    const frame = Math.floor(t * 5);
    for (let k = 1; k <= 14; k++) {
      const x = left + SHIP_WIDTH - 4 + k;
      if (noise(k, frame) < 0.8 * (1 - k / 14)) put(x, HORIZON + 1, FOAM);
      if (noise(k + 40, frame) < 0.5 * (1 - k / 14)) put(x + 1, HORIZON + 2, PALETTE[3]);
    }
    for (let k = 0; k < 3; k++) {
      if (noise(k + 80, frame) < 0.7) put(left + 1 + k, HORIZON + 1, FOAM);
    }
  };

  const draw = t => {
    drawSea(t);
    drawShip(t);
    fieldCtx.putImageData(image, 0, 0);
  };

  let started = false;
  new ResizeObserver(([entry]) => {
    resize(entry.contentRect.width, entry.contentRect.height);
    if (reduceMotion) return draw(0);
    if (started) return;
    started = true;
    let last = 0;
    const loop = now => {
      if (now - last > 1000 / 15) {
        last = now;
        draw(now / 1000);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }).observe(field);
})();
