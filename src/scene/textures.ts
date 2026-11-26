import * as THREE from 'three';

export interface ProceduralTextureSet {
  grassColor: THREE.CanvasTexture;
  grassRoughness: THREE.CanvasTexture;
  asphaltColor: THREE.CanvasTexture;
  asphaltRoughness: THREE.CanvasTexture;
  kerbStripe: THREE.CanvasTexture;
  startBanner: THREE.CanvasTexture;
  finishBanner: THREE.CanvasTexture;
  finishStrip: THREE.CanvasTexture;
  startGrid: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  skyBackdrop: THREE.CanvasTexture;
  concourseColor: THREE.CanvasTexture;
  floodlightBank: THREE.CanvasTexture;
  scoreboardDisplay: THREE.CanvasTexture;
  timingDisplay: THREE.CanvasTexture;
  stadiumBanner: THREE.CanvasTexture;
  parkLawnColor: THREE.CanvasTexture;
  dispose: () => void;
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function createGrassAlbedoTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Bright, vibrant stylized meadow green base
  ctx.fillStyle = '#667c4e';
  ctx.fillRect(0, 0, size, size);

  // Soft mowed-turf bands for subtle scale & game-art polish
  const bandCount = 8;
  const bandW = size / bandCount;
  for (let i = 0; i < bandCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(139, 153, 99, 0.14)' : 'rgba(57, 80, 44, 0.12)';
    ctx.fillRect(i * bandW, 0, bandW, size);
  }

  // Subtle organic turf variation patches (soft low-contrast blobs)
  const rand = seededRand(101);
  for (let i = 0; i < 240; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 8 + rand() * 24;
    const light = rand() > 0.5;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, light ? 'rgba(145, 163, 104, 0.10)' : 'rgba(52, 75, 42, 0.10)');
    grad.addColorStop(1, 'rgba(102, 124, 78, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine stylized grass blade ticks
  for (let i = 0; i < 1600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 3 + rand() * 5;
    ctx.strokeStyle = rand() > 0.45 ? 'rgba(153, 165, 112, 0.22)' : 'rgba(56, 76, 44, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 2, y - len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createGrassRoughnessTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgb(232, 232, 232)';
  ctx.fillRect(0, 0, size, size);

  const rand = seededRand(202);
  for (let i = 0; i < 900; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 216 + Math.floor(rand() * 32);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 3, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createAsphaltAlbedoTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Neutral asphalt aggregate; UVs are metre-scaled on town roads.
  ctx.fillStyle = '#333943';
  ctx.fillRect(0, 0, size, size);

  const rand = seededRand(303);
  for (let i = 0; i < 3800; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const shade = 40 + Math.floor(rand() * 30);
    ctx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 9}, 0.34)`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createKerbStripeTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 64;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Alternating FIA red & crisp white concrete kerb blocks along V
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, w, h / 2);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, h / 2, w, h / 2);

  // Subtle concrete joint & inner bevel highlight
  ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
  ctx.fillRect(0, h / 2 - 3, w, 6);
  ctx.fillRect(0, h - 3, w, 3);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(6, 0, 8, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createAsphaltRoughnessTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgb(218, 218, 218)';
  ctx.fillRect(0, 0, size, size);

  const rand = seededRand(404);
  for (let i = 0; i < 2000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 198 + Math.floor(rand() * 42);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createBannerSignTexture(
  label: 'START' | 'FINISH',
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const w = 1024;
  const h = 288;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  if (label === 'START') {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ec3b2b');
    grad.addColorStop(1, '#c32014');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle white diagonal racing accent bars on both ends
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    for (const sideX of [32, w - 126]) {
      ctx.beginPath();
      ctx.moveTo(sideX, h - 40);
      ctx.lineTo(sideX + 34, 40);
      ctx.lineTo(sideX + 68, 40);
      ctx.lineTo(sideX + 34, h - 40);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(sideX + 54, h - 40);
      ctx.lineTo(sideX + 88, 40);
      ctx.lineTo(sideX + 110, 40);
      ctx.lineTo(sideX + 76, h - 40);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 12;
    ctx.strokeRect(12, 12, w - 24, h - 24);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1e2530');
    grad.addColorStop(1, '#12161d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Checkered racing squares on both ends
    const rows = 4;
    const cols = 3;
    const sq = (h - 32) / rows;
    for (const startX of [20, w - 20 - cols * sq]) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = (r + c) % 2 === 0 ? '#f6f8fa' : '#161a22';
          ctx.fillRect(startX + c * sq, 16 + r * sq, sq, sq);
        }
      }
    }

    ctx.strokeStyle = '#f5b82e';
    ctx.lineWidth = 12;
    ctx.strokeRect(12, 12, w - 24, h - 24);
  }

  // Bold high-contrast lettering sized for high spectator legibility
  ctx.font = '900 162px "Inter", "Segoe UI", system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillText(label, w / 2, h / 2 + 10);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, w / 2, h / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createFinishStripTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const cols = 12;
  const rows = 3;
  const cw = w / cols;
  const ch = h / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#eef1f5' : '#262b33';
      ctx.fillRect(c * cw, r * ch, cw + 0.5, ch + 0.5);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createStartGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, w, h);

  // Subtle painted starting line bar at front (+tangent = bottom of canvas after -PI/2 X rotation)
  ctx.fillStyle = 'rgba(240, 244, 248, 0.85)';
  ctx.fillRect(14, h - 30, w - 28, 12);

  // 4 subtle staggered starting grid brackets behind the starting line
  const slots: Array<[number, number]> = [
    [42, h - 130],
    [146, h - 215],
    [42, h - 305],
    [146, h - 390],
  ];
  const slotW = 68;
  const armLen = 30;
  const lw = 8;

  ctx.fillStyle = 'rgba(238, 242, 246, 0.78)';
  for (const [sx, sy] of slots) {
    ctx.fillRect(sx, sy + armLen - lw, slotW, lw);
    ctx.fillRect(sx, sy, lw, armLen);
    ctx.fillRect(sx + slotW - lw, sy, lw, armLen);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(16, 26, 18, 0.65)');
  grad.addColorStop(0.55, 'rgba(16, 26, 18, 0.22)');
  grad.addColorStop(1, 'rgba(16, 26, 18, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSkyBackdropTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#9cd2f7');
  grad.addColorStop(0.55, '#cbe8fb');
  grad.addColorStop(1, '#eaf5fd');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createConcourseTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#c5ccd4';
  ctx.fillRect(0, 0, size, size);

  const rand = seededRand(505);
  for (let i = 0; i < 1200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const v = 186 + Math.floor(rand() * 24);
    ctx.fillStyle = `rgba(${v}, ${v + 4}, ${v + 8}, 0.38)`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Subtle architectural expansion joint lines
  ctx.strokeStyle = 'rgba(92, 106, 124, 0.34)';
  ctx.lineWidth = 2;
  for (const pos of [0, 64, 128, 192]) {
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(size, pos);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createFloodlightBankTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#202630';
  ctx.fillRect(0, 0, w, h);

  const cols = 6;
  const rows = 2;
  const padX = 24;
  const padY = 22;
  const gapX = 14;
  const gapY = 16;
  const cellW = (w - padX * 2 - gapX * (cols - 1)) / cols;
  const cellH = (h - padY * 2 - gapY * (rows - 1)) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * (cellW + gapX);
      const y = padY + r * (cellH + gapY);
      ctx.fillStyle = '#cfd7e3';
      ctx.fillRect(x - 3, y - 3, cellW + 6, cellH + 6);

      const grad = ctx.createRadialGradient(
        x + cellW * 0.5,
        y + cellH * 0.5,
        2,
        x + cellW * 0.5,
        y + cellH * 0.5,
        cellW * 0.65,
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.6, '#fff8db');
      grad.addColorStop(1, '#f3dfa2');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, cellW, cellH);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createScoreboardTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f1621';
  ctx.fillRect(0, 0, w, h);

  // Header strip
  const headerGrad = ctx.createLinearGradient(0, 0, w, 0);
  headerGrad.addColorStop(0, '#c72c22');
  headerGrad.addColorStop(0.55, '#e23f31');
  headerGrad.addColorStop(1, '#1e2c3e');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(18, 18, w - 36, 92);

  ctx.fillStyle = '#ffffff';
  ctx.font = '900 50px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('APEX CIRCUIT ARENA', 44, 66);

  ctx.fillStyle = '#f8d04a';
  ctx.font = '800 32px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('STADIUM', w - 44, 66);

  // Left card: stylized track outline graphic
  ctx.fillStyle = '#182230';
  ctx.fillRect(28, 132, 340, 348);
  ctx.strokeStyle = '#33465d';
  ctx.lineWidth = 4;
  ctx.strokeRect(28, 132, 340, 348);

  ctx.strokeStyle = '#6fe265';
  ctx.lineWidth = 14;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(270, 320);
  ctx.lineTo(270, 410);
  ctx.quadraticCurveTo(255, 440, 190, 438);
  ctx.lineTo(95, 435);
  ctx.bezierCurveTo(60, 430, 62, 360, 115, 360);
  ctx.lineTo(175, 355);
  ctx.bezierCurveTo(205, 355, 205, 290, 165, 285);
  ctx.lineTo(100, 278);
  ctx.quadraticCurveTo(64, 240, 82, 185);
  ctx.quadraticCurveTo(105, 162, 185, 162);
  ctx.lineTo(278, 168);
  ctx.bezierCurveTo(320, 175, 318, 240, 265, 240);
  ctx.lineTo(212, 238);
  ctx.bezierCurveTo(182, 240, 182, 285, 225, 290);
  ctx.quadraticCurveTo(270, 296, 270, 320);
  ctx.stroke();

  // Right table: static graphic sector & display rows (pure stadium art)
  ctx.fillStyle = '#16202e';
  ctx.fillRect(390, 132, w - 418, 348);
  ctx.strokeStyle = '#33465d';
  ctx.lineWidth = 4;
  ctx.strokeRect(390, 132, w - 418, 348);

  const rowColors = ['#e04637', '#3588e8', '#e5a428', '#48bd54', '#a4b2c4'];
  const rowLabels = ['SECTOR 1', 'SECTOR 2', 'SECTOR 3', 'TRACK TEMP', 'SESSION'];
  const rowValues = ['00:18.42', '00:24.16', '00:19.05', '24 C', 'OPEN'];

  for (let i = 0; i < 5; i++) {
    const ry = 148 + i * 64;
    ctx.fillStyle = i % 2 === 0 ? '#1d293a' : '#182332';
    ctx.fillRect(408, ry, w - 454, 52);
    ctx.fillStyle = rowColors[i];
    ctx.fillRect(408, ry, 14, 52);

    ctx.fillStyle = '#cbd6e3';
    ctx.font = '700 26px "Inter", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(rowLabels[i], 438, ry + 27);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(rowValues[i], w - 64, ry + 27);
  }

  ctx.strokeStyle = '#60738c';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createTimingDisplayTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#111822';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#e04637';
  ctx.fillRect(14, 14, w - 28, 68);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 32px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TIMING', w / 2, 48);

  const bars = [
    ['S1', '18.4', '#6fe265'],
    ['S2', '24.1', '#f8d04a'],
    ['S3', '19.0', '#6fe265'],
    ['BEST', '1:01.5', '#ffffff'],
    ['GRID', 'OPEN', '#74b8ff'],
  ];
  for (let i = 0; i < bars.length; i++) {
    const y = 104 + i * 78;
    ctx.fillStyle = '#1c2635';
    ctx.fillRect(18, y, w - 36, 62);
    ctx.fillStyle = '#9aa8ba';
    ctx.font = '700 22px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(bars[i][0], 30, y + 32);

    ctx.fillStyle = bars[i][2];
    ctx.font = '800 26px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(bars[i][1], w - 30, y + 32);
  }

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createStadiumBannerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1f3656');
  grad.addColorStop(1, '#15243b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#e04637';
  ctx.fillRect(0, 44, w, 46);
  ctx.fillStyle = '#f4b938';
  ctx.fillRect(0, h - 90, w, 26);

  ctx.save();
  ctx.translate(w / 2, h / 2 + 12);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 54px "Inter", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('APEX GP', 0, 0);
  ctx.restore();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createParkLawnTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#687e50';
  ctx.fillRect(0, 0, size, size);

  const bandCount = 8;
  const bandW = size / bandCount;
  for (let i = 0; i < bandCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(134, 150, 97, 0.14)' : 'rgba(57, 77, 43, 0.12)';
    ctx.fillRect(i * bandW, 0, bandW, size);
  }

  const rand = seededRand(606);
  for (let i = 0; i < 400; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 6 + rand() * 18;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(147, 158, 108, 0.08)' : 'rgba(53, 73, 42, 0.08)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const grassColor = createGrassAlbedoTexture(maxAnisotropy);
  const grassRoughness = createGrassRoughnessTexture(maxAnisotropy);
  const asphaltColor = createAsphaltAlbedoTexture(maxAnisotropy);
  const asphaltRoughness = createAsphaltRoughnessTexture(maxAnisotropy);
  const kerbStripe = createKerbStripeTexture(maxAnisotropy);
  const startBanner = createBannerSignTexture('START', maxAnisotropy);
  const finishBanner = createBannerSignTexture('FINISH', maxAnisotropy);
  const finishStrip = createFinishStripTexture(maxAnisotropy);
  const startGrid = createStartGridTexture(maxAnisotropy);
  const contactShadow = createContactShadowTexture();
  const skyBackdrop = createSkyBackdropTexture();
  const concourseColor = createConcourseTexture(maxAnisotropy);
  const floodlightBank = createFloodlightBankTexture(maxAnisotropy);
  const scoreboardDisplay = createScoreboardTexture(maxAnisotropy);
  const timingDisplay = createTimingDisplayTexture(maxAnisotropy);
  const stadiumBanner = createStadiumBannerTexture(maxAnisotropy);
  const parkLawnColor = createParkLawnTexture(maxAnisotropy);

  return {
    grassColor,
    grassRoughness,
    asphaltColor,
    asphaltRoughness,
    kerbStripe,
    startBanner,
    finishBanner,
    finishStrip,
    startGrid,
    contactShadow,
    skyBackdrop,
    concourseColor,
    floodlightBank,
    scoreboardDisplay,
    timingDisplay,
    stadiumBanner,
    parkLawnColor,
    dispose: () => {
      grassColor.dispose();
      grassRoughness.dispose();
      asphaltColor.dispose();
      asphaltRoughness.dispose();
      kerbStripe.dispose();
      startBanner.dispose();
      finishBanner.dispose();
      finishStrip.dispose();
      startGrid.dispose();
      contactShadow.dispose();
      skyBackdrop.dispose();
      concourseColor.dispose();
      floodlightBank.dispose();
      scoreboardDisplay.dispose();
      timingDisplay.dispose();
      stadiumBanner.dispose();
      parkLawnColor.dispose();
    },
  };
}
