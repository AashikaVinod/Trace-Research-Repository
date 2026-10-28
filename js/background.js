// ===================================================================
// background.js - the moving liquid behind the app.
//
// You don't need to edit this file to use TRACE. It draws one rectangle
// that covers the screen and asks the graphics card (WebGL) to colour
// every pixel with a "domain-warped noise" formula. Feeding noise into
// itself several times gives swirling shapes that look like coloured ink
// moving in water. Changing the time slowly makes the liquid flow.
//
// - Pause motion (sidebar) stops the flow and stops redrawing.
// - Reduced motion (system setting) draws one still frame.
// - No WebGL: the still image assets/liquid.webp shows instead (CSS).
// - Phones: the app fills the screen, so this doesn't run at all.
// ===================================================================

(function startLiquid() {
  const canvas = document.getElementById('liquid');
  const backdrop = document.querySelector('.backdrop');
  if (!canvas || getComputedStyle(backdrop).display === 'none') return;

  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return; // the CSS fallback image is already showing

  // ---- The shader: runs once for every pixel, every frame ----
  const vertexShader = `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

  const fragmentShader = `
    precision mediump float;
    uniform vec2 size;    // canvas size in pixels
    uniform float time;   // seconds

    // Smooth random values on a grid ("value noise").
    float random(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(random(i), random(i + vec2(1.0, 0.0)), u.x),
                 mix(random(i + vec2(0.0, 1.0)), random(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    // Layers of noise from big to small ("fractal noise") = lots of detail.
    float layers(vec2 p) {
      float total = 0.0;
      float strength = 0.5;
      mat2 turn = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 4; i++) {
        total += strength * noise(p);
        p = turn * p;
        strength *= 0.5;
      }
      return total;
    }

    // Celadon glaze: near-black spruce -> deep green -> celadon -> pale jade -> oat.
    // One cool ramp keeps it calm; only the brightest folds turn pale.
    vec3 ink(float x) {
      vec3 c = mix(vec3(0.012, 0.024, 0.020), vec3(0.05, 0.16, 0.14), smoothstep(0.00, 0.35, x));
      c = mix(c, vec3(0.30, 0.52, 0.45), smoothstep(0.35, 0.62, x));
      c = mix(c, vec3(0.66, 0.80, 0.71), smoothstep(0.62, 0.84, x));
      return mix(c, vec3(0.94, 0.90, 0.82), smoothstep(0.86, 1.00, x));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / size.y * 0.75;  // small number = big, slow shapes
      uv.x *= 0.8;
      float t = time * 0.016;                      // gentle speed

      // Domain warping, kept mild so the liquid folds rather than churns.
      vec2 q = vec2(layers(uv + vec2(0.0, t)), layers(uv + vec2(5.2, 1.3) - t));
      vec2 r = vec2(layers(uv + 2.6 * q + vec2(1.7, 9.2) + 0.5 * t),
                    layers(uv + 2.6 * q + vec2(8.3, 2.8) - 0.4 * t));
      float f = layers(uv + 2.6 * r);

      float grain = layers(uv * 6.0 + 4.0 * r);               // fine swirl texture inside the folds
      vec3 color = ink(clamp(pow(f, 2.6) * 2.05 + (grain - 0.5) * 0.18, 0.0, 0.95));

      // A soft light that drifts slowly underneath.
      vec2 p = gl_FragCoord.xy / size - 0.5;
      p.x *= size.x / size.y;
      vec2 centre = vec2(0.40 * sin(time * 0.03), 0.24 * cos(time * 0.022));
      color *= 0.55 + 0.7 * exp(-dot(p - centre, p - centre) * 1.8);
      gl_FragColor = vec4(color, 1.0);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return; // fallback image stays
  gl.useProgram(program);

  // Two triangles that cover the whole canvas.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const sizeUniform = gl.getUniformLocation(program, 'size');
  const timeUniform = gl.getUniformLocation(program, 'time');

  // Draw at a lower resolution and let CSS stretch it: the liquid is soft,
  // so nobody can see the difference, and it's several times faster.
  const QUALITY = 0.4;
  function resize() {
    canvas.width = Math.round(innerWidth * QUALITY);
    canvas.height = Math.round(innerHeight * QUALITY);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  let seconds = 20; // start part-way in, where the swirls are already formed
  function draw() {
    gl.uniform2f(sizeUniform, canvas.width, canvas.height);
    gl.uniform1f(timeUniform, seconds);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  resize();
  draw();
  canvas.classList.add('ready'); // fade in over the fallback image
  window.addEventListener('resize', () => { resize(); draw(); });

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; // one still frame

  // At most 30 frames a second: the liquid moves slowly, so this looks the
  // same as 60 and uses half the graphics work (and battery).
  let last = performance.now();
  function tick(now) {
    const paused = document.body.classList.contains('still') || document.hidden;
    if (!paused && now - last >= 33) {
      seconds += Math.min(now - last, 100) / 1000;
      draw();
      last = now;
    } else if (paused) {
      last = now;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
