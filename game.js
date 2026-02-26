/**
 * Hole.io Clone – Web Game
 * Single-file game engine using HTML5 Canvas
 */

(function () {
  'use strict';

  // ─────────────────────────────────────────────
  //  Constants
  // ─────────────────────────────────────────────
  const WORLD_SIZE   = 2400;   // square world in pixels
  const GAME_DURATION = 120;   // seconds
  const AI_COUNT     = 4;
  const OBJECTS_COUNT = 380;   // map objects to spawn

  // Object type catalogue: [label, minR, maxR, baseScore, color, shape]
  // shape: 'rect' | 'circle' | 'person'
  const OBJECT_TYPES = [
    { label: 'person',   minR: 6,  maxR: 9,  score: 1,  color: '#f9c74f', shape: 'person'  },
    { label: 'tree',     minR: 10, maxR: 16, score: 2,  color: '#43aa8b', shape: 'circle'  },
    { label: 'bench',    minR: 10, maxR: 14, score: 2,  color: '#8d6e63', shape: 'rect'    },
    { label: 'car',      minR: 16, maxR: 22, score: 5,  color: '#e63946', shape: 'rect'    },
    { label: 'van',      minR: 20, maxR: 28, score: 8,  color: '#457b9d', shape: 'rect'    },
    { label: 'small bld',minR: 28, maxR: 38, score: 15, color: '#a8dadc', shape: 'rect'    },
    { label: 'house',    minR: 36, maxR: 50, score: 25, color: '#f1faee', shape: 'rect'    },
    { label: 'building', minR: 50, maxR: 72, score: 50, color: '#bde0fe', shape: 'rect'    },
    { label: 'tower',    minR: 72, maxR: 100,score: 100,color: '#cdb4db', shape: 'rect'    },
  ];

  const HOLE_COLORS = ['#9b5de5','#f15bb5','#fee440','#00bbf9','#00f5d4','#fb5607'];
  const AI_NAMES    = ['Vortex','Gulp','Nomnom','Swallower','Chomper','Abyss'];

  // ─────────────────────────────────────────────
  //  DOM refs
  // ─────────────────────────────────────────────
  const canvas        = document.getElementById('gameCanvas');
  const ctx           = canvas.getContext('2d');
  const minimapCanvas = document.getElementById('minimap');
  const minimapCtx    = minimapCanvas.getContext('2d');

  const hudEl         = document.getElementById('hud');
  const timerFill     = document.getElementById('timer-fill');
  const scoreVal      = document.getElementById('score-val');
  const timerVal      = document.getElementById('timer-val');
  const leaderboardEl = document.getElementById('leaderboard');
  const lbList        = document.getElementById('leaderboard-list');
  const controlsHint  = document.getElementById('controls-hint');
  const startOverlay  = document.getElementById('start-overlay');
  const endOverlay    = document.getElementById('end-overlay');
  const resultTitle   = document.getElementById('result-title');
  const resultSubtitle= document.getElementById('result-subtitle');
  const finalScores   = document.getElementById('final-scores');
  const startBtn      = document.getElementById('start-btn');
  const playAgainBtn  = document.getElementById('play-again-btn');
  const playerNameInput = document.getElementById('player-name');

  // ─────────────────────────────────────────────
  //  Game state
  // ─────────────────────────────────────────────
  let state = 'menu'; // 'menu' | 'playing' | 'ended'
  let objects   = [];
  let holes     = [];   // index 0 = player
  let timeLeft  = GAME_DURATION;
  let lastTimestamp = 0;
  let timerAccum    = 0;
  let animId        = 0;
  let mouseWorld    = { x: 0, y: 0 };
  let mouseMoved    = false;
  let keys          = {};

  // ─────────────────────────────────────────────
  //  Resize handler
  // ─────────────────────────────────────────────
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // ─────────────────────────────────────────────
  //  Input
  // ─────────────────────────────────────────────
  window.addEventListener('keydown', e => { keys[e.key] = true; });
  window.addEventListener('keyup',   e => { keys[e.key] = false; });

  canvas.addEventListener('mousemove', e => {
    mouseMoved = true;
    // Convert screen coords to world coords relative to camera
    const player = holes[0];
    if (!player) return;
    const camX = player.x - canvas.width  / 2;
    const camY = player.y - canvas.height / 2;
    mouseWorld.x = e.clientX + camX;
    mouseWorld.y = e.clientY + camY;
  });

  // Touch support
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const touch = e.touches[0];
    mouseMoved = true;
    const player = holes[0];
    if (!player) return;
    const camX = player.x - canvas.width  / 2;
    const camY = player.y - canvas.height / 2;
    mouseWorld.x = touch.clientX + camX;
    mouseWorld.y = touch.clientY + camY;
  }, { passive: false });

  // ─────────────────────────────────────────────
  //  Utilities
  // ─────────────────────────────────────────────
  function rand(min, max) { return min + Math.random() * (max - min); }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  // ─────────────────────────────────────────────
  //  World-object creation
  // ─────────────────────────────────────────────
  function createObjects() {
    objects = [];
    const margin = 80;
    for (let i = 0; i < OBJECTS_COUNT; i++) {
      const type = OBJECT_TYPES[randInt(0, OBJECT_TYPES.length - 1)];
      const r    = rand(type.minR, type.maxR);
      const x    = rand(margin + r, WORLD_SIZE - margin - r);
      const y    = rand(margin + r, WORLD_SIZE - margin - r);
      const obj  = {
        x, y, r,
        type: type.label,
        score: type.score,
        color: type.color,
        shape: type.shape,
        angle: rand(0, Math.PI * 2),
        // Wobble/fall animation when being eaten
        eaten: false,
        eatProgress: 0,
      };
      // Rect objects: width/height derived from r
      if (type.shape === 'rect') {
        obj.w = r * 2 * rand(0.9, 1.4);
        obj.h = r * 2 * rand(0.9, 1.8);
      }
      objects.push(obj);
    }
  }

  // ─────────────────────────────────────────────
  //  Hole creation
  // ─────────────────────────────────────────────
  function createHole(x, y, name, color, isPlayer) {
    return {
      x, y, name, color, isPlayer,
      r: 18,          // radius
      score: 0,
      vx: 0, vy: 0,
      speed: 200,     // px/s
      // AI state
      aiTarget: null,
      aiThinkTimer: 0,
    };
  }

  function spawnHoles(playerName) {
    holes = [];
    // Player at center
    holes.push(createHole(WORLD_SIZE / 2, WORLD_SIZE / 2, playerName, HOLE_COLORS[0], true));
    // AI holes at random positions
    const spread = WORLD_SIZE * 0.35;
    for (let i = 0; i < AI_COUNT; i++) {
      const angle = (i / AI_COUNT) * Math.PI * 2;
      const px = WORLD_SIZE / 2 + Math.cos(angle) * spread + rand(-100, 100);
      const py = WORLD_SIZE / 2 + Math.sin(angle) * spread + rand(-100, 100);
      const color = HOLE_COLORS[(i + 1) % HOLE_COLORS.length];
      const name  = AI_NAMES[i % AI_NAMES.length];
      holes.push(createHole(px, py, name, color, false));
    }
  }

  // ─────────────────────────────────────────────
  //  Physics helpers
  // ─────────────────────────────────────────────

  /** Grow hole area by object's area, scale radius accordingly */
  function growHole(hole, obj) {
    const area = Math.PI * hole.r * hole.r + Math.PI * obj.r * obj.r * 0.6;
    hole.r = Math.sqrt(area / Math.PI);
    hole.score += obj.score;
    // Speed decreases slightly as hole grows (harder to maneuver)
    hole.speed = Math.max(90, 200 - (hole.r - 18) * 0.8);
  }

  /** Clamp hole inside world */
  function clampHole(hole) {
    hole.x = clamp(hole.x, hole.r, WORLD_SIZE - hole.r);
    hole.y = clamp(hole.y, hole.r, WORLD_SIZE - hole.r);
  }

  // ─────────────────────────────────────────────
  //  Player movement
  // ─────────────────────────────────────────────
  function movePlayer(hole, dt) {
    let dx = 0, dy = 0;

    // Keyboard
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) dx -= 1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
    if (keys['ArrowUp']    || keys['w'] || keys['W']) dy -= 1;
    if (keys['ArrowDown']  || keys['s'] || keys['S']) dy += 1;

    // Mouse (overrides keyboard if mouse has moved)
    if (mouseMoved) {
      const mdx = mouseWorld.x - hole.x;
      const mdy = mouseWorld.y - hole.y;
      const md  = Math.sqrt(mdx * mdx + mdy * mdy);
      if (md > hole.r * 0.5) {
        // Ramp speed linearly up to full speed over a deadzone
        const factor = Math.min(1, md / (hole.r * 4));
        dx = (mdx / md) * factor;
        dy = (mdy / md) * factor;
      } else {
        dx = dy = 0;
      }
    }

    // Normalise diagonal
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      hole.vx = (dx / len) * hole.speed;
      hole.vy = (dy / len) * hole.speed;
    } else {
      hole.vx *= 0.85;
      hole.vy *= 0.85;
    }

    hole.x += hole.vx * dt;
    hole.y += hole.vy * dt;
    clampHole(hole);
  }

  // ─────────────────────────────────────────────
  //  AI movement
  // ─────────────────────────────────────────────
  function moveAI(hole, dt) {
    hole.aiThinkTimer -= dt;
    if (hole.aiThinkTimer <= 0 || !hole.aiTarget) {
      hole.aiThinkTimer = rand(1.2, 2.8);
      // Pick closest eatable object
      let best = null, bestD2 = Infinity;
      for (const obj of objects) {
        if (obj.eaten) continue;
        if (obj.r > hole.r * 1.1) continue;
        const d2 = dist2(hole.x, hole.y, obj.x, obj.y);
        if (d2 < bestD2) { bestD2 = d2; best = obj; }
      }
      // Also consider eating smaller holes
      for (const other of holes) {
        if (other === hole) continue;
        if (other.r >= hole.r * 0.85) continue;
        const d2 = dist2(hole.x, hole.y, other.x, other.y);
        if (d2 < bestD2) { bestD2 = d2; best = { x: other.x, y: other.y, _hole: other }; }
      }
      hole.aiTarget = best;
    }

    // Refresh target position for moving targets (other holes)
    if (hole.aiTarget && hole.aiTarget._hole) {
      hole.aiTarget.x = hole.aiTarget._hole.x;
      hole.aiTarget.y = hole.aiTarget._hole.y;
    }

    if (hole.aiTarget) {
      const dx = hole.aiTarget.x - hole.x;
      const dy = hole.aiTarget.y - hole.y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d > 2) {
        hole.vx = (dx / d) * hole.speed;
        hole.vy = (dy / d) * hole.speed;
      }
    } else {
      // Wander
      if (hole.aiThinkTimer <= 0 || (hole.vx === 0 && hole.vy === 0)) {
        const a = rand(0, Math.PI * 2);
        hole.vx = Math.cos(a) * hole.speed;
        hole.vy = Math.sin(a) * hole.speed;
      }
    }

    hole.x += hole.vx * dt;
    hole.y += hole.vy * dt;
    clampHole(hole);
  }

  // ─────────────────────────────────────────────
  //  Collision: hole vs objects
  // ─────────────────────────────────────────────
  function checkCollisions() {
    for (const hole of holes) {
      for (const obj of objects) {
        if (obj.eaten) continue;
        if (obj.r > hole.r * 1.05) continue; // too big
        const d2 = dist2(hole.x, hole.y, obj.x, obj.y);
        const threshold = hole.r * 0.82; // how deep center must be
        if (d2 < threshold * threshold) {
          obj.eaten = true;
          obj.eatProgress = 0;
          growHole(hole, obj);
        }
      }
    }

    // Hole vs hole absorption
    for (let i = 0; i < holes.length; i++) {
      for (let j = i + 1; j < holes.length; j++) {
        const a = holes[i], b = holes[j];
        const d2 = dist2(a.x, a.y, b.x, b.y);
        const overlap = (a.r + b.r) * 0.5;
        if (d2 < overlap * overlap) {
          if (a.r > b.r * 1.2) {
            // a eats b
            const fakeObj = { r: b.r, score: Math.floor(b.score * 0.3 + 10) };
            growHole(a, fakeObj);
            holes.splice(j, 1);
            j--;
          } else if (b.r > a.r * 1.2) {
            // b eats a
            const fakeObj = { r: a.r, score: Math.floor(a.score * 0.3 + 10) };
            growHole(b, fakeObj);
            holes.splice(i, 1);
            i--;
            break;
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  //  Rendering helpers
  // ─────────────────────────────────────────────

  function drawGrid(camX, camY) {
    const step = 80;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth   = 1;

    const startX = Math.floor(camX / step) * step;
    const startY = Math.floor(camY / step) * step;
    const endX   = camX + canvas.width  + step;
    const endY   = camY + canvas.height + step;

    ctx.beginPath();
    for (let x = startX; x < endX; x += step) {
      ctx.moveTo(x - camX, 0);
      ctx.lineTo(x - camX, canvas.height);
    }
    for (let y = startY; y < endY; y += step) {
      ctx.moveTo(0, y - camY);
      ctx.lineTo(canvas.width, y - camY);
    }
    ctx.stroke();
  }

  function drawWorldBorder(camX, camY) {
    ctx.strokeStyle = 'rgba(123,47,247,0.5)';
    ctx.lineWidth   = 4;
    ctx.strokeRect(-camX, -camY, WORLD_SIZE, WORLD_SIZE);
  }

  function drawObject(obj, camX, camY) {
    const sx = obj.x - camX;
    const sy = obj.y - camY;

    // Fade out / scale down when eaten
    let alpha = 1, scale = 1;
    if (obj.eaten) {
      scale = 1 - obj.eatProgress;
      alpha = 1 - obj.eatProgress;
      if (alpha <= 0) return;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(sx, sy);
    ctx.rotate(obj.angle);
    ctx.scale(scale, scale);

    ctx.fillStyle = obj.color;

    if (obj.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, obj.r, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(-obj.r * 0.25, -obj.r * 0.3, obj.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (obj.shape === 'person') {
      // Body
      ctx.fillStyle = obj.color;
      ctx.beginPath();
      ctx.arc(0, 0, obj.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      // Head
      ctx.beginPath();
      ctx.arc(0, -obj.r * 0.8, obj.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // Arms
      ctx.strokeStyle = obj.color;
      ctx.lineWidth   = obj.r * 0.2;
      ctx.beginPath();
      ctx.moveTo(-obj.r * 0.55, -obj.r * 0.2);
      ctx.lineTo( obj.r * 0.55, -obj.r * 0.2);
      ctx.stroke();
    } else {
      // rect
      const w = obj.w || obj.r * 2;
      const h = obj.h || obj.r * 2;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      // Window highlights for buildings
      if (obj.type === 'building' || obj.type === 'tower' || obj.type === 'house' || obj.type === 'small bld') {
        ctx.fillStyle = 'rgba(255,255,180,0.4)';
        const cols = Math.max(1, Math.floor(w / 14));
        const rows = Math.max(1, Math.floor(h / 16));
        const padX = w * 0.12, padY = h * 0.12;
        const ww   = (w - 2 * padX) / cols * 0.55;
        const wh   = (h - 2 * padY) / rows * 0.55;
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const wx = -w / 2 + padX + c * ((w - 2 * padX) / cols);
            const wy = -h / 2 + padY + r * ((h - 2 * padY) / rows);
            ctx.fillRect(wx, wy, ww, wh);
          }
        }
      }
    }

    ctx.restore();
  }

  function drawHole(hole, camX, camY) {
    const sx = hole.x - camX;
    const sy = hole.y - camY;

    // Skip if off-screen with margin
    if (sx < -hole.r * 2 || sx > canvas.width  + hole.r * 2) return;
    if (sy < -hole.r * 2 || sy > canvas.height + hole.r * 2) return;

    ctx.save();
    ctx.translate(sx, sy);

    // Outer glow ring
    const gradient = ctx.createRadialGradient(0, 0, hole.r * 0.6, 0, 0, hole.r * 1.6);
    gradient.addColorStop(0, hole.color + 'aa');
    gradient.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(0, 0, hole.r * 1.6, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Dark hole pit
    const pitGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, hole.r);
    pitGrad.addColorStop(0, '#000');
    pitGrad.addColorStop(0.7, '#0a0a14');
    pitGrad.addColorStop(1, hole.color + '88');
    ctx.beginPath();
    ctx.arc(0, 0, hole.r, 0, Math.PI * 2);
    ctx.fillStyle = pitGrad;
    ctx.fill();

    // Coloured rim
    ctx.beginPath();
    ctx.arc(0, 0, hole.r, 0, Math.PI * 2);
    ctx.strokeStyle = hole.color;
    ctx.lineWidth   = Math.max(2, hole.r * 0.1);
    ctx.stroke();

    // Name label
    const fontSize = Math.max(11, Math.min(18, hole.r * 0.7));
    ctx.fillStyle = '#fff';
    ctx.font      = `bold ${fontSize}px Segoe UI, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = '#000';
    ctx.shadowBlur   = 4;
    ctx.fillText(hole.name.substring(0, 10), 0, hole.r + fontSize + 2);
    ctx.shadowBlur   = 0;

    ctx.restore();
  }

  // ─────────────────────────────────────────────
  //  Mini-map
  // ─────────────────────────────────────────────
  function drawMinimap() {
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;
    const scale = mw / WORLD_SIZE;

    minimapCtx.clearRect(0, 0, mw, mh);
    minimapCtx.fillStyle = 'rgba(10,10,20,0.85)';
    minimapCtx.fillRect(0, 0, mw, mh);

    // Objects (dots)
    for (const obj of objects) {
      if (obj.eaten && obj.eatProgress > 0.8) continue;
      minimapCtx.fillStyle = obj.color + '99';
      const s = Math.max(1.5, obj.r * scale * 1.5);
      minimapCtx.fillRect(obj.x * scale - s / 2, obj.y * scale - s / 2, s, s);
    }

    // Holes
    for (const hole of holes) {
      minimapCtx.beginPath();
      minimapCtx.arc(hole.x * scale, hole.y * scale, Math.max(3, hole.r * scale * 1.2), 0, Math.PI * 2);
      minimapCtx.fillStyle = hole.isPlayer ? '#fff' : hole.color;
      minimapCtx.fill();
    }

    // Border
    minimapCtx.strokeStyle = 'rgba(255,255,255,0.3)';
    minimapCtx.lineWidth   = 1;
    minimapCtx.strokeRect(0, 0, mw, mh);
  }

  // ─────────────────────────────────────────────
  //  Leaderboard update
  // ─────────────────────────────────────────────
  function updateLeaderboard() {
    const sorted = [...holes].sort((a, b) => b.score - a.score);
    lbList.innerHTML = '';
    sorted.slice(0, 5).forEach(h => {
      const li = document.createElement('li');
      if (h.isPlayer) li.classList.add('player-entry');
      li.innerHTML = `<span class="lb-name">${escHtml(h.name)}</span><span class="lb-score">${h.score}</span>`;
      lbList.appendChild(li);
    });
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ─────────────────────────────────────────────
  //  Game start / end
  // ─────────────────────────────────────────────
  function startGame() {
    const playerName = (playerNameInput.value.trim() || 'Player').substring(0, 16);
    timeLeft  = GAME_DURATION;
    timerAccum = 0;
    keys      = {};
    mouseMoved = false;

    createObjects();
    spawnHoles(playerName);

    startOverlay.classList.add('hidden');
    endOverlay.classList.add('hidden');
    hudEl.classList.remove('hidden');
    leaderboardEl.classList.remove('hidden');
    controlsHint.classList.remove('hidden');
    minimapCanvas.style.display = 'block';

    scoreVal.textContent = '0';
    timerVal.textContent = GAME_DURATION;
    timerFill.style.width = '100%';

    state = 'playing';
    lastTimestamp = performance.now();
    cancelAnimationFrame(animId);
    animId = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    state = 'ended';
    cancelAnimationFrame(animId);

    hudEl.classList.add('hidden');
    leaderboardEl.classList.add('hidden');
    controlsHint.classList.add('hidden');

    // Find player
    const allHoles = [...holes];
    // Reconstruct full list (player may have been eaten)
    allHoles.sort((a, b) => b.score - a.score);

    const playerEntry = allHoles.find(h => h.isPlayer) || { name: playerNameInput.value || 'Player', score: 0, isPlayer: true };
    const rank = allHoles.indexOf(playerEntry) + 1;

    if (rank === 1) {
      resultTitle.textContent = '🏆 You Win!';
      resultTitle.className   = 'result-title win';
    } else {
      resultTitle.textContent = `#${rank} Place`;
      resultTitle.className   = 'result-title lose';
    }
    resultSubtitle.textContent = 'Final Standings';

    finalScores.innerHTML = '';
    allHoles.forEach((h, i) => {
      const li = document.createElement('li');
      if (h.isPlayer) li.classList.add('player-entry');
      li.innerHTML = `<span class="fs-rank">#${i + 1}</span><span class="fs-name">${escHtml(h.name)}</span><span class="fs-score">${h.score}</span>`;
      finalScores.appendChild(li);
    });

    endOverlay.classList.remove('hidden');
  }

  // ─────────────────────────────────────────────
  //  Main game loop
  // ─────────────────────────────────────────────
  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.05); // cap at 50ms
    lastTimestamp = timestamp;

    if (state !== 'playing') return;

    // ── Update timer ──
    timerAccum += dt;
    if (timerAccum >= 1) {
      timeLeft   -= Math.floor(timerAccum);
      timerAccum -= Math.floor(timerAccum);
      if (timeLeft <= 0) {
        timeLeft = 0;
        timerVal.textContent  = '0';
        timerFill.style.width = '0%';
        endGame();
        return;
      }
      timerVal.textContent  = timeLeft;
      timerFill.style.width = (timeLeft / GAME_DURATION * 100) + '%';
    }

    // ── Update eaten animation ──
    for (const obj of objects) {
      if (obj.eaten) obj.eatProgress = Math.min(1, obj.eatProgress + dt * 4);
    }

    // ── Update holes ──
    const player = holes.find(h => h.isPlayer);

    for (const hole of holes) {
      if (hole.isPlayer) {
        movePlayer(hole, dt);
      } else {
        moveAI(hole, dt);
      }
    }

    // ── Collisions ──
    checkCollisions();

    // Check if player was eaten
    const stillAlive = holes.find(h => h.isPlayer);
    if (!stillAlive) {
      // Player was consumed – show end screen after short delay
      setTimeout(endGame, 800);
      state = 'ended';
    }

    // ── Update HUD ──
    if (player) {
      scoreVal.textContent = player.score;
    }
    updateLeaderboard();

    // ── Render ──
    const cam = player || holes[0] || { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
    const camX = cam.x - canvas.width  / 2;
    const camY = cam.y - canvas.height / 2;

    // Background
    ctx.fillStyle = '#101020';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid(camX, camY);
    drawWorldBorder(camX, camY);

    // Draw objects (back to front by y)
    const visObjects = objects.filter(o => {
      if (o.eaten && o.eatProgress >= 1) return false;
      const sx = o.x - camX, sy = o.y - camY;
      return sx > -200 && sx < canvas.width + 200 && sy > -200 && sy < canvas.height + 200;
    }).sort((a, b) => a.y - b.y);

    for (const obj of visObjects) drawObject(obj, camX, camY);

    // Draw holes
    for (const hole of holes) drawHole(hole, camX, camY);

    drawMinimap();

    animId = requestAnimationFrame(gameLoop);
  }

  // ─────────────────────────────────────────────
  //  Button handlers
  // ─────────────────────────────────────────────
  startBtn.addEventListener('click', startGame);
  playAgainBtn.addEventListener('click', () => {
    endOverlay.classList.add('hidden');
    startOverlay.classList.remove('hidden');
  });
  playerNameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') startGame();
  });

})();
