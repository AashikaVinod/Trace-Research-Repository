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

    void main() {
      vec2 uv = gl_FragCoord.xy / size.y * 2.4;
      uv.x *= 0.7;                      // stretch sideways, so swirls look like flowing streaks
      float t = time * 0.035;

      // Domain warping: the noise is used to bend the noise, twice.
      vec2 q = vec2(layers(uv + vec2(0.0, t)), layers(uv + vec2(5.2, 1.3) - t));
      vec2 r = vec2(layers(uv + 5.0 * q + vec2(1.7, 9.2) + 0.7 * t),
                    layers(uv + 5.0 * q + vec2(8.3, 2.8) - 0.6 * t));
      float f = layers(uv + 5.0 * r);

      // How much "ink" is here: mostly dark, with bright wisps.
      float ink = pow(f, 3.8) * 6.0;
      float wisps = pow(layers(uv * 2.6 + 6.0 * r), 5.0) * 3.0; // fine filaments

      // Which TRACE colour this part of the liquid is (changes slowly across the screen).
      vec3 tint = mix(vec3(0.48, 0.30, 1.00), vec3(0.10, 0.42, 1.00), smoothstep(0.35, 0.65, q.x)); // violet -> blue
      tint = mix(tint, vec3(0.05, 0.82, 0.55), smoothstep(0.55, 0.80, r.y) * 0.75);                  // green
      tint = mix(tint, vec3(1.00, 0.48, 0.14), smoothstep(0.52, 0.78, r.x));                          // orange
      tint = mix(tint, vec3(1.00, 0.30, 0.64), smoothstep(0.60, 0.85, q.y) * 0.85);                   // pink

      vec3 color = vec3(0.012, 0.010, 0.022) + tint * (ink + wisps * ink * 0.8);

      // A soft glow that drifts around, like light under the liquid.
      vec2 p = gl_FragCoord.xy / size - 0.5;
      p.x *= size.x / size.y;
      vec2 centre = vec2(0.45 * sin(time * 0.05), 0.28 * cos(time * 0.037));
      color *= 0.22 + 1.7 * exp(-dot(p - centre, p - centre) * 2.0);

      color = 1.0 - exp(-color * 1.4); // tone-map: bright parts glow instead of turning white
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
