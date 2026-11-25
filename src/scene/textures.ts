import * as THREE from 'three';

export interface ProceduralTextureSet {
  grassColor: THREE.CanvasTexture;
  grassRoughness: THREE.CanvasTexture;
  asphaltColor: THREE.CanvasTexture;
  asphaltRoughness: THREE.CanvasTexture;
  startBanner: THREE.CanvasTexture;
  finishBanner: THREE.CanvasTexture;
  finishStrip: THREE.CanvasTexture;
  startGrid: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  skyBackdrop: THREE.CanvasTexture;
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
  ctx.fillStyle = '#3fb838';
  ctx.fillRect(0, 0, size, size);

  // Soft mowed-turf bands for subtle scale & game-art polish
  const bandCount = 8;
  const bandW = size / bandCount;
  for (let i = 0; i < bandCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(92, 212, 72, 0.14)' : 'rgba(36, 138, 32, 0.12)';
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
    grad.addColorStop(0, light ? 'rgba(104, 222, 82, 0.10)' : 'rgba(34, 130, 30, 0.10)');
    grad.addColorStop(1, 'rgba(63, 184, 56, 0)');
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
    ctx.strokeStyle = rand() > 0.45 ? 'rgba(122, 232, 98, 0.22)' : 'rgba(30, 118, 26, 0.18)';
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

  // Clean stylized dark slate asphalt (smooth and readable from distance)
  ctx.fillStyle = '#363c46';
  ctx.fillRect(0, 0, size, size);

  const rand = seededRand(303);
  for (let i = 0; i < 3200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const shade = 44 + Math.floor(rand() * 26);
    ctx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 10}, 0.35)`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
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

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const grassColor = createGrassAlbedoTexture(maxAnisotropy);
  const grassRoughness = createGrassRoughnessTexture(maxAnisotropy);
  const asphaltColor = createAsphaltAlbedoTexture(maxAnisotropy);
  const asphaltRoughness = createAsphaltRoughnessTexture(maxAnisotropy);
  const startBanner = createBannerSignTexture('START', maxAnisotropy);
  const finishBanner = createBannerSignTexture('FINISH', maxAnisotropy);
  const finishStrip = createFinishStripTexture(maxAnisotropy);
  const startGrid = createStartGridTexture(maxAnisotropy);
  const contactShadow = createContactShadowTexture();
  const skyBackdrop = createSkyBackdropTexture();

  return {
    grassColor,
    grassRoughness,
    asphaltColor,
    asphaltRoughness,
    startBanner,
    finishBanner,
    finishStrip,
    startGrid,
    contactShadow,
    skyBackdrop,
    dispose: () => {
      grassColor.dispose();
      grassRoughness.dispose();
      asphaltColor.dispose();
      asphaltRoughness.dispose();
      startBanner.dispose();
      finishBanner.dispose();
      finishStrip.dispose();
      startGrid.dispose();
      contactShadow.dispose();
      skyBackdrop.dispose();
    },
  };
}
