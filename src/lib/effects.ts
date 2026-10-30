// Animated background particles for the special themes, drawn on one canvas behind the app.
// requestAnimationFrame pauses by itself while the app is in the background.

type Kind = 'gold' | 'lightning' | 'fire' | 'ice';
type P = { x: number; y: number; vx: number; vy: number; r: number; age: number; life: number; seed: number; star: boolean };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A soft round glow, pre-rendered once so each particle is a cheap drawImage. */
function sprite(color: string, snow = false, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, '#fff');
  if (snow) {
    // White flake with a pale blue rim, so it shows on the light Ice background.
    grad.addColorStop(0.5, color);
    grad.addColorStop(0.62, 'rgb(165 200 240 / 0.35)');
    grad.addColorStop(1, 'rgb(165 200 240 / 0)');
  } else {
    grad.addColorStop(0.18, color);
    // Fade to the same colour at zero alpha ('transparent' is black, which greys the edges).
    grad.addColorStop(1, `${color}00`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

const SETUP: Record<Kind, { density: number; colors: string[]; spawn: (w: number, h: number, first: boolean) => P }> = {
  // Embers rising from the bottom, swaying, fading as they cool.
  fire: {
    density: 1 / 6500,
    colors: ['#ffb000', '#ff7a00', '#ff4d00', '#ffd27a'],
    spawn: (w, h, first) => ({ x: rand(0, w), y: first ? rand(0, h) : h + rand(0, 30), vx: rand(-8, 8), vy: rand(-70, -25), r: rand(1.2, 3.4), age: 0, life: rand(3, 7), seed: rand(0, 99), star: false }),
  },
  // Snow drifting down.
  ice: {
    density: 1 / 5500,
    colors: ['#ffffff', '#dbeeff'],
    spawn: (w, h, first) => ({ x: rand(0, w), y: first ? rand(0, h) : rand(-30, -5), vx: rand(-6, 6), vy: rand(14, 42), r: rand(1.2, 4), age: 0, life: 99, seed: rand(0, 99), star: false }),
  },
  // Gold dust floating up and twinkling; some are four-point sparkles.
  gold: {
    density: 1 / 8000,
    colors: ['#f7d774', '#ffe9a8', '#e0a93a'],
    spawn: (w, h) => ({ x: rand(0, w), y: rand(0, h), vx: rand(-4, 4), vy: rand(-14, -3), r: rand(0.8, 2.4), age: 0, life: rand(3, 7), seed: rand(0, 99), star: Math.random() < 0.25 }),
  },
  // Electric sparks zipping around.
  lightning: {
    density: 1 / 11000,
    colors: ['#5ee7ff', '#a26bff', '#c9f6ff'],
    spawn: (w, h) => ({ x: rand(0, w), y: rand(0, h), vx: rand(-40, 40), vy: rand(-40, 40), r: rand(0.8, 2), age: 0, life: rand(0.6, 2.2), seed: rand(0, 99), star: false }),
  },
};

/** A jagged lightning bolt from the top edge, with a couple of branches. */
function makeBolt(w: number, h: number) {
  const paths: [number, number][][] = [];
  const walk = (x: number, y: number, endY: number, spread: number, depth: number) => {
    const pts: [number, number][] = [[x, y]];
    while (y < endY) {
      y += rand(12, 34);
      x += rand(-spread, spread);
      pts.push([x, y]);
      if (depth < 2 && Math.random() < 0.12) walk(x, y, y + rand(60, 160), spread * 0.8, depth + 1);
    }
    paths.push(pts);
  };
  walk(rand(w * 0.15, w * 0.85), -10, rand(h * 0.35, h * 0.75), 22, 0);
  return paths;
}

/** Starts the effect on `canvas`; returns a stop function. `onStrike` fires with the bolt's x (0–1) for the screen flash. */
export function startEffect(kind: Kind, canvas: HTMLCanvasElement, onStrike?: (x: number) => void) {
  const ctx = canvas.getContext('2d')!;
  const cfg = SETUP[kind];
  const sprites = cfg.colors.map((c) => sprite(c, kind === 'ice'));
  let w = 0;
  let h = 0;
  let parts: P[] = [];
  let bolt: { paths: [number, number][][]; age: number } | null = null;
  let nextStrike = rand(1.5, 4);
  let raf = 0;
  let last = performance.now();

  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(w * h * cfg.density);
    parts = Array.from({ length: n }, () => cfg.spawn(w, h, true));
  };

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = kind === 'ice' ? 'source-over' : 'lighter';

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.age += dt;
      p.x += (p.vx + Math.sin(t * 1.3 + p.seed) * (kind === 'fire' ? 14 : kind === 'ice' ? 10 : 3)) * dt;
      p.y += p.vy * dt;
      if (p.age > p.life || p.y < -40 || p.y > h + 40 || p.x < -40 || p.x > w + 40) {
        parts[i] = cfg.spawn(w, h, false);
        continue;
      }
      const fade = kind === 'ice' ? 0.85 : Math.sin(Math.PI * Math.min(1, p.age / p.life));
      const twinkle = kind === 'gold' ? 0.55 + 0.45 * Math.sin(t * 4 + p.seed * 3) : 1;
      ctx.globalAlpha = Math.max(0, fade * twinkle);
      const img = sprites[Math.floor(p.seed) % sprites.length];
      const size = p.r * (kind === 'ice' ? 4.5 : 7);
      ctx.drawImage(img, p.x - size / 2, p.y - size / 2, size, size);
      if (p.star) {
        // Four-point sparkle for the gold dust.
        const s = p.r * 5 * twinkle;
        ctx.strokeStyle = '#fff2c4';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(p.x - s, p.y);
        ctx.lineTo(p.x + s, p.y);
        ctx.moveTo(p.x, p.y - s);
        ctx.lineTo(p.x, p.y + s);
        ctx.stroke();
      }
    }

    if (kind === 'lightning') {
      nextStrike -= dt;
      if (nextStrike <= 0) {
        bolt = { paths: makeBolt(w, h), age: 0 };
        nextStrike = rand(3, 8);
        onStrike?.(bolt.paths.at(-1)![0][0] / w);
      }
      if (bolt) {
        bolt.age += dt;
        const a = Math.max(0, 1 - bolt.age / 0.45) * (bolt.age < 0.08 || bolt.age > 0.14 ? 1 : 0.3); // flicker
        for (const [width, color, alpha] of [[16, '#5ee7ff', 0.2], [6, '#a7f3ff', 0.55], [2.2, '#ffffff', 1]] as const) {
          ctx.globalAlpha = a * alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.lineJoin = 'round';
          for (const pts of bolt.paths) {
            ctx.beginPath();
            pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
          }
        }
        if (bolt.age > 0.45) bolt = null;
      }
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
}
