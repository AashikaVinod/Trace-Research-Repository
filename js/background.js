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
      for (int i = 0; i < 5; i++) {
        total += strength * noise(p);
        p = turn * p;
        strength *= 0.5;
      }
      return total;
    }

    // Two clean colour ramps from the TRACE palette. Each part of the liquid
    // uses one ramp, so colours only blend with their neighbours (no mud).
    vec3 warm(float x) { // black -> violet -> pink -> orange -> gold
      vec3 c = mix(vec3(0.03, 0.01, 0.07), vec3(0.42, 0.18, 1.00), smoothstep(0.00, 0.30, x));
      c = mix(c, vec3(1.00, 0.28, 0.70), smoothstep(0.30, 0.55, x));
      c = mix(c, vec3(1.00, 0.55, 0.18), smoothstep(0.55, 0.78, x));
      return mix(c, vec3(1.00, 0.90, 0.55), smoothstep(0.80, 1.00, x));
    }
    vec3 cool(float x) { // black -> navy -> blue -> cyan -> mint
      vec3 c = mix(vec3(0.01, 0.02, 0.07), vec3(0.08, 0.20, 0.85), smoothstep(0.00, 0.30, x));
      c = mix(c, vec3(0.15, 0.55, 1.00), smoothstep(0.30, 0.55, x));
      c = mix(c, vec3(0.10, 0.90, 0.85), smoothstep(0.55, 0.78, x));
      return mix(c, vec3(0.75, 1.00, 0.80), smoothstep(0.80, 1.00, x));
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / size.y * 1.15;  // small number = big swirls
      uv.x *= 0.8;
      float t = time * 0.03;

      // Domain warping: the noise is used to bend the noise, twice.
      vec2 q = vec2(layers(uv + vec2(0.0, t)), layers(uv + vec2(5.2, 1.3) - t));
      vec2 r = vec2(layers(uv + 4.0 * q + vec2(1.7, 9.2) + 0.7 * t),
                    layers(uv + 4.0 * q + vec2(8.3, 2.8) - 0.6 * t));
      float f = layers(uv + 4.0 * r);

      // Brightness along the ramp: dark valleys, bright ridges, a little fine detail.
      float detail = layers(uv * 3.0 + 3.0 * r);
      float x = clamp(pow(f, 2.4) * 2.4 + (detail - 0.5) * 0.25, 0.0, 0.9);

      // Big regions are warm or cool, with a narrow blend between them.
      float side = smoothstep(0.42, 0.58, q.x + 0.25 * (r.y - 0.5));
      vec3 color = mix(warm(x), cool(x), side);

      // A soft light that drifts around underneath.
      vec2 p = gl_FragCoord.xy / size - 0.5;
      p.x *= size.x / size.y;
      vec2 centre = vec2(0.42 * sin(time * 0.05), 0.26 * cos(time * 0.037));
      color *= 0.5 + 0.8 * exp(-dot(p - centre, p - centre) * 2.0);
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
