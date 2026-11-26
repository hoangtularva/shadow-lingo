// The drawn "video" for the README demos and store screenshots, shared by the extension and the
// desktop demo: a speaker in a room, like a podcast shot. No real video or person is shown.
// Kept free of imports and outer variables: callers send its source into the page as a string.

/**
 * Draws the scene on `canvas` (any 16:9 size) every frame. The speaker talks while a line is
 * on; `burned` also paints the lines on the picture, like burned-in subtitles.
 */
export function speakerScene(
  canvas: HTMLCanvasElement,
  lines: [number, number, string][],
  burned: boolean,
): void {
  const k = canvas.width / 640;
  const g = canvas.getContext('2d');
  if (!g) return;
  // A drawn speaker in a room, like a podcast or vlog shot. The room is drawn once, blurred
  // like a shallow depth of field; the speaker moves, blinks and talks over it.
  const room = document.createElement('canvas');
  room.width = canvas.width;
  room.height = canvas.height;
  const r = room.getContext('2d');
  if (!r) return;
  r.scale(k, k);
  r.filter = `blur(${4 * k}px)`;
  const wall = r.createLinearGradient(0, 0, 640, 360);
  wall.addColorStop(0, '#d9c6ad');
  wall.addColorStop(1, '#a8927a');
  r.fillStyle = wall;
  r.fillRect(-10, -10, 660, 380);
  const sky = r.createLinearGradient(0, 40, 0, 230);
  sky.addColorStop(0, '#9fd0ee');
  sky.addColorStop(1, '#eef7fb');
  r.fillStyle = '#f4efe6';
  r.fillRect(22, 32, 176, 206);
  r.fillStyle = sky;
  r.fillRect(32, 42, 156, 186);
  r.fillStyle = '#7fa36b';
  r.beginPath();
  r.ellipse(80, 228, 70, 34, 0, Math.PI, 0);
  r.fill();
  r.fillStyle = '#f4efe6';
  r.fillRect(106, 42, 8, 186);
  r.fillRect(32, 132, 156, 8);
  r.fillStyle = '#6e5a48';
  r.fillRect(470, 92, 160, 8);
  r.fillRect(470, 168, 160, 8);
  const books = ['#c4553f', '#3f6e8c', '#e0b54a', '#5d7d4f', '#8a4f7d', '#d98b4a', '#2f4858'];
  for (const [shelf, y] of [92, 168].entries()) {
    let x = 478;
    for (let i = 0; x < 620; i++) {
      const w = 10 + ((i * 7 + shelf * 3) % 9);
      const h = 44 + ((i * 13 + shelf * 5) % 22);
      r.fillStyle = books[(i + shelf * 3) % books.length] ?? '#c4553f';
      r.fillRect(x, y - h, w, h);
      x += w + 2;
    }
  }
  r.fillStyle = '#b5653f';
  r.fillRect(196, 262, 46, 40);
  r.fillStyle = '#4f7d45';
  const leaves: [number, number, number][] = [
    [-16, -30, -0.6],
    [12, -38, 0.4],
    [-2, -52, 0],
    [24, -18, 0.9],
    [-26, -12, -1],
  ];
  for (const [dx, dy, a] of leaves) {
    r.beginPath();
    r.ellipse(219 + dx, 262 + dy, 9, 24, a, 0, Math.PI * 2);
    r.fill();
  }
  r.fillStyle = '#5b4030';
  r.fillRect(-10, 318, 660, 60);
  r.filter = 'none';
  const glow = r.createRadialGradient(110, 130, 10, 110, 130, 260);
  glow.addColorStop(0, 'rgba(255,248,230,0.35)');
  glow.addColorStop(1, 'rgba(255,248,230,0)');
  r.fillStyle = glow;
  r.fillRect(0, 0, 640, 360);

  const SKIN = '#e6b48f';
  const ell = (x: number, y: number, rx: number, ry: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  const t0 = performance.now();
  const draw = () => {
    const t = (performance.now() - t0) / 1000;
    const ms = t * 1000;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.drawImage(room, 0, 0, 640, 360);
    // Talks while a line is on, with a short pause at the end of each line.
    const row = lines.find(([a, b]) => ms % 13000 >= a && ms % 13000 < b - 450);
    const talk = row ? Math.max(0, Math.sin(t * 17) * 0.6 + Math.sin(t * 7.3) * 0.4) : 0;
    const blink = t % 3.7 < 0.13 ? 0.1 : 1;
    const hx = Math.sin(t * 0.9) * 3;
    const hy = Math.sin(t * 1.7) * 1.5;

    // Shoulders and sweater.
    g.fillStyle = '#2f6f6a';
    g.beginPath();
    g.moveTo(200, 360);
    g.bezierCurveTo(205, 290, 250, 262, 330, 258);
    g.bezierCurveTo(410, 262, 455, 290, 460, 360);
    g.fill();
    g.fillStyle = '#285f5b';
    g.beginPath();
    g.moveTo(300, 262);
    g.quadraticCurveTo(330, 292, 360, 262);
    g.fill();
    g.fillStyle = '#d29f7c';
    g.fillRect(312, 214, 36, 50);

    g.save();
    g.translate(330 + hx, 170 + hy);
    g.rotate(Math.sin(t * 0.6) * 0.03);
    // Hair behind, ears, face.
    ell(0, 2, 62, 78, '#2b1d16');
    ell(-52, 4, 9, 14, '#d9a682');
    ell(52, 4, 9, 14, '#d9a682');
    ell(0, 6, 51, 63, SKIN);
    // Fringe.
    g.fillStyle = '#2b1d16';
    g.beginPath();
    g.moveTo(-54, 4);
    g.bezierCurveTo(-62, -74, 44, -90, 56, -6);
    g.bezierCurveTo(36, -40, 4, -48, -12, -40);
    g.bezierCurveTo(-30, -30, -44, -14, -54, 4);
    g.fill();
    // Cheeks, brows, eyes, nose, mouth.
    ell(-28, 22, 11, 7, 'rgba(214,120,110,0.25)');
    ell(28, 22, 11, 7, 'rgba(214,120,110,0.25)');
    g.strokeStyle = '#2b1d16';
    g.lineWidth = 3.5;
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 12, -14 - talk * 2);
      g.quadraticCurveTo(s * 22, -19 - talk * 2, s * 32, -14 - talk * 2);
      g.stroke();
      ell(s * 21, -1, 7, 5.5 * blink, '#fbf7f2');
      if (blink === 1) ell(s * 21 + 1, -1, 3.6, 3.6, '#2a2320');
    }
    g.strokeStyle = '#c48a68';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(-1, 6);
    g.quadraticCurveTo(-5, 18, 3, 20);
    g.stroke();
    const open = 2 + talk * 9;
    ell(0, 36, 13 + talk * 2, open, '#8c3b3b');
    if (open > 5) {
      g.fillStyle = '#fbf7f2';
      g.fillRect(-8, 36 - open + 1, 16, 3);
    }
    g.restore();

    // Podcast microphone on an arm, below the face.
    g.strokeStyle = '#2b2b2e';
    g.lineWidth = 4;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(660, 238);
    g.lineTo(540, 196);
    g.lineTo(432, 252);
    g.stroke();
    ell(540, 196, 5, 5, '#2b2b2e');
    g.fillStyle = '#26262a';
    g.beginPath();
    g.roundRect(400, 236, 34, 70, 16);
    g.fill();
    g.fillStyle = '#3a3a40';
    for (let y = 244; y < 296; y += 7) g.fillRect(404, y, 26, 3);

    const vignette = g.createRadialGradient(320, 180, 160, 320, 180, 420);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = vignette;
    g.fillRect(0, 0, 640, 360);
    if (burned) {
      const at = ms - 3000;
      const line = at < 0 ? '' : (lines.find(([a, b]) => at >= a && at < b)?.[2] ?? '');
      if (line) {
        g.font = 'bold 26px Arial';
        g.textAlign = 'center';
        g.lineWidth = 5;
        g.strokeStyle = '#000';
        g.strokeText(line, 320, 318);
        g.fillStyle = '#fff';
        g.fillText(line, 320, 318);
      }
    }
    requestAnimationFrame(draw);
  };
  draw();
}
