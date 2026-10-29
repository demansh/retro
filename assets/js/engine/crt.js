const POWER_ON_SECONDS = 0.6;
const POWER_OFF_SECONDS = 0.35;
const PERSISTENCE_PER_FRAME = 0.72;
const DEFAULT_PALETTE = {
  phosphor: [0.2, 1.0, 0.4],
  ghost: [0.65, 1.0, 0.2],
  background: [0.008, 0.04, 0.008],
};

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif`;

const PERSISTENCE_SHADER = `${PRECISION}
varying vec2 vUv;
uniform sampler2D uCurrent;
uniform sampler2D uPrevious;
uniform float uDecay;
void main() {
  vec3 current = texture2D(uCurrent, vUv).rgb;
  vec3 previous = texture2D(uPrevious, vUv).rgb * uDecay - 1.0 / 255.0;
  gl_FragColor = vec4(max(current, previous), 1.0);
}`;

const COMPOSITE_SHADER = `${PRECISION}
varying vec2 vUv;
uniform sampler2D uPhosphor;
uniform vec2 uSourceSize;
uniform vec2 uOutputSize;
uniform float uTime;
uniform vec2 uScale;
uniform vec2 uShake;
uniform vec3 uBand;
uniform float uJitter;
uniform float uSplit;
uniform float uRoll;
uniform float uFlash;
uniform float uFlicker;
uniform float uBloom;
uniform float uPower;
uniform vec3 uPhosphorColor;
uniform vec3 uGhostColor;
uniform vec3 uBackgroundColor;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 curve(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 offset = abs(uv.yx) / vec2(5.5, 4.5);
  uv = uv + uv * offset * offset;
  return uv * 0.5 + 0.5;
}

float luminance(vec2 uv) {
  return dot(texture2D(uPhosphor, uv).rgb, vec3(0.299, 0.587, 0.114));
}

float tubeMask(vec2 uv) {
  vec2 corner = max(abs(uv - 0.5) * 2.0 - 0.9, 0.0);
  return 1.0 - smoothstep(0.09, 0.1, length(corner));
}

void main() {
  vec2 tube = curve(vUv);
  float mask = tubeMask(tube) * uPower;
  vec2 uv = (tube - 0.5) / uScale + 0.5;
  mask *= step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  uv += uShake;
  uv.y = fract(uv.y + uRoll);
  float row = floor(uv.y * uSourceSize.y);
  float band = step(uBand.x, uv.y) * step(uv.y, uBand.x + uBand.y);
  uv.x += band * uBand.z;
  uv.x += (hash(vec2(row, floor(uTime * 60.0))) - 0.5) * uJitter;
  uv.x += sin(uv.y * 30.0 + uTime * 1.7) * 0.0006;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0);

  float base = luminance(uv) * inside;
  float glow = 0.0;
  if (uBloom > 0.5) {
    vec2 texel = 1.0 / uSourceSize;
    glow += luminance(uv + vec2(texel.x, 0.0));
    glow += luminance(uv - vec2(texel.x, 0.0));
    glow += luminance(uv + vec2(0.0, texel.y));
    glow += luminance(uv - vec2(0.0, texel.y));
    glow += luminance(uv + texel * 2.0);
    glow += luminance(uv - texel * 2.0);
    glow += luminance(uv + vec2(texel.x, -texel.y) * 2.0);
    glow += luminance(uv + vec2(-texel.x, texel.y) * 2.0);
    glow *= inside / 8.0;
  }
  float ghost = uSplit > 0.0 ? luminance(uv + vec2(uSplit, 0.0)) : 0.0;

  float rowsPerLine = uOutputSize.y / uSourceSize.y;
  float scanStrength = clamp((rowsPerLine - 1.5) / 3.0, 0.0, 0.45);
  float scan = 0.5 + 0.5 * cos(6.2831853 * (uv.y * uSourceSize.y - 0.5));
  float intensity = base * mix(1.0 - scanStrength, 1.0, scan) + glow * 0.55;

  vec3 color = uBackgroundColor + uPhosphorColor * intensity + uGhostColor * ghost * 0.5;
  float barPosition = 1.0 - fract(uTime * 0.11);
  color += uPhosphorColor * (1.0 - smoothstep(0.0, 0.08, abs(vUv.y - barPosition))) * 0.035;
  color += (hash(vUv * uOutputSize + fract(uTime) * 100.0) - 0.5) * 0.05;
  color *= uFlicker;
  color += uPhosphorColor * uFlash * 0.6;

  vec2 vignetteUv = tube * (1.0 - tube.yx);
  color *= pow(clamp(vignetteUv.x * vignetteUv.y * 16.0, 0.0, 1.0), 0.22);
  gl_FragColor = vec4(color * mask, 1.0);
}`;

function createPower(reducedMotion) {
  let level = 0;
  let target = 0;
  let speed = 0;
  let resolvePending = null;

  function finish() {
    if (resolvePending) {
      const resolve = resolvePending;
      resolvePending = null;
      resolve();
    }
  }

  function animate(to, seconds) {
    finish();
    target = to;
    if (reducedMotion || seconds <= 0) {
      level = to;
      return Promise.resolve();
    }
    speed = 1 / seconds;
    return new Promise((resolve) => {
      resolvePending = resolve;
    });
  }

  function update(deltaSeconds) {
    if (level === target) {
      return;
    }
    level = target > level ? Math.min(target, level + speed * deltaSeconds) : Math.max(target, level - speed * deltaSeconds);
    if (level === target) {
      finish();
    }
  }

  function uniforms() {
    const horizontalPhase = Math.min(level / 0.4, 1);
    const verticalPhase = Math.max((level - 0.4) / 0.6, 0);
    return {
      scaleX: 0.02 + 0.98 * horizontalPhase,
      scaleY: 0.006 + 0.994 * verticalPhase,
      power: level > 0 ? 1 : 0,
      powerGlow: level > 0 && level < 1 ? (1 - level) * 1.5 : 0,
    };
  }

  return { animate, update, uniforms };
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${log}`);
  }
  return shader;
}

function createProgram(gl, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader link failed: ${gl.getProgramInfoLog(program)}`);
  }
  const locations = {};
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let index = 0; index < uniformCount; index++) {
    const { name } = gl.getActiveUniform(program, index);
    locations[name] = gl.getUniformLocation(program, name);
  }
  return { program, locations };
}

function createTexture(gl, width, height) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (width > 0) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  return texture;
}

function createWebGlRenderer(canvas, gl, buffer) {
  let resources = null;
  let isContextLost = false;
  let isBloomEnabled = true;
  let readIndex = 0;

  function initialize() {
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const targets = [0, 1].map(() => {
      const texture = createTexture(gl, buffer.width, buffer.height);
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { texture, framebuffer };
    });
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Phosphor framebuffer is incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    resources = {
      source: createTexture(gl, 0, 0),
      targets,
      persistence: createProgram(gl, PERSISTENCE_SHADER),
      composite: createProgram(gl, COMPOSITE_SHADER),
    };
  }

  function bindTexture(unit, texture) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  function draw(state, frameSeconds) {
    if (isContextLost || !resources) {
      return;
    }
    const { source, targets, persistence, composite } = resources;
    const writeIndex = 1 - readIndex;

    bindTexture(0, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buffer.canvas);

    gl.bindFramebuffer(gl.FRAMEBUFFER, targets[writeIndex].framebuffer);
    gl.viewport(0, 0, buffer.width, buffer.height);
    gl.useProgram(persistence.program);
    bindTexture(1, targets[readIndex].texture);
    gl.uniform1i(persistence.locations.uCurrent, 0);
    gl.uniform1i(persistence.locations.uPrevious, 1);
    gl.uniform1f(persistence.locations.uDecay, Math.pow(PERSISTENCE_PER_FRAME, frameSeconds * 60));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(composite.program);
    bindTexture(0, targets[writeIndex].texture);
    const uniforms = composite.locations;
    gl.uniform1i(uniforms.uPhosphor, 0);
    gl.uniform2f(uniforms.uSourceSize, buffer.width, buffer.height);
    gl.uniform2f(uniforms.uOutputSize, canvas.width, canvas.height);
    gl.uniform1f(uniforms.uTime, state.time);
    gl.uniform2f(uniforms.uScale, state.scaleX, state.scaleY);
    gl.uniform2f(uniforms.uShake, state.shakeX, -state.shakeY);
    gl.uniform3f(uniforms.uBand, state.bandY, state.bandHeight, state.bandOffset);
    gl.uniform1f(uniforms.uJitter, state.jitter);
    gl.uniform1f(uniforms.uSplit, state.split);
    gl.uniform1f(uniforms.uRoll, state.roll);
    gl.uniform1f(uniforms.uFlash, state.flash + state.powerGlow);
    gl.uniform1f(uniforms.uFlicker, state.flicker);
    gl.uniform1f(uniforms.uBloom, isBloomEnabled ? 1 : 0);
    gl.uniform1f(uniforms.uPower, state.power);
    gl.uniform3fv(uniforms.uPhosphorColor, state.palette.phosphor);
    gl.uniform3fv(uniforms.uGhostColor, state.palette.ghost);
    gl.uniform3fv(uniforms.uBackgroundColor, state.palette.background);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    readIndex = writeIndex;
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    isContextLost = true;
    resources = null;
  });

  canvas.addEventListener("webglcontextrestored", () => {
    try {
      initialize();
      isContextLost = false;
    } catch (error) {
      console.error("Unable to restore CRT renderer", error);
    }
  });

  initialize();

  return {
    canvas,
    isAccelerated: true,
    draw,
    setQuality: (quality) => {
      isBloomEnabled = quality !== "low";
    },
  };
}

function toCssColor(channels, alpha = 1) {
  const [red, green, blue] = channels.map((channel) => Math.round(channel * 255));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function createCanvasRenderer(canvas, buffer) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Canvas 2D is unavailable");
  }
  canvas.classList.add("is-fallback");

  function draw(state) {
    const { width, height } = canvas;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "#000";
    context.fillRect(0, 0, width, height);
    if (state.power === 0) {
      return;
    }
    context.imageSmoothingEnabled = false;
    const targetWidth = width * state.scaleX;
    const targetHeight = height * state.scaleY;
    const left = (width - targetWidth) / 2 - state.shakeX * width;
    const top = (height - targetHeight) / 2 - state.shakeY * height;
    context.drawImage(buffer.canvas, left, top, targetWidth, targetHeight);
    if (state.bandHeight > 0) {
      const sourceY = Math.floor((1 - state.bandY - state.bandHeight) * buffer.height);
      const sourceHeight = Math.max(1, Math.ceil(state.bandHeight * buffer.height));
      const rowHeight = targetHeight / buffer.height;
      context.drawImage(buffer.canvas, 0, sourceY, buffer.width, sourceHeight, left + state.bandOffset * targetWidth, top + sourceY * rowHeight, targetWidth, sourceHeight * rowHeight);
    }
    context.globalCompositeOperation = "multiply";
    context.fillStyle = toCssColor(state.palette.phosphor);
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = "source-over";
    const rowHeight = height / buffer.height;
    if (rowHeight >= 3) {
      context.fillStyle = "rgba(0, 0, 0, 0.3)";
      for (let row = 0; row < buffer.height; row++) {
        context.fillRect(0, Math.round(row * rowHeight + rowHeight * 0.66), width, Math.max(1, Math.round(rowHeight * 0.34)));
      }
    }
    const flash = state.flash + state.powerGlow;
    if (flash > 0) {
      context.fillStyle = toCssColor(state.palette.phosphor, Math.min(flash * 0.4, 0.8));
      context.fillRect(0, 0, width, height);
    }
  }

  return { canvas, isAccelerated: false, draw, setQuality: () => {} };
}

function replaceCanvas(canvas) {
  const replacement = canvas.cloneNode(false);
  canvas.replaceWith(replacement);
  return replacement;
}

function createRenderer(canvas, buffer) {
  let gl = null;
  try {
    gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
    if (gl) {
      return createWebGlRenderer(canvas, gl, buffer);
    }
  } catch (error) {
    console.warn("WebGL CRT renderer is unavailable, falling back to Canvas 2D", error);
  }
  return createCanvasRenderer(gl ? replaceCanvas(canvas) : canvas, buffer);
}

export function createCrt(canvas, buffer, { reducedMotion = false } = {}) {
  const power = createPower(reducedMotion);
  const renderer = createRenderer(canvas, buffer);
  let time = 0;
  let palette = DEFAULT_PALETTE;

  function render(effects, frameSeconds) {
    time += frameSeconds;
    power.update(frameSeconds);
    renderer.draw({ ...effects, ...power.uniforms(), time, palette }, frameSeconds);
  }

  function setPalette(nextPalette) {
    palette = nextPalette ?? DEFAULT_PALETTE;
  }

  return {
    canvas: renderer.canvas,
    isAccelerated: renderer.isAccelerated,
    render,
    setQuality: renderer.setQuality,
    setPalette,
    powerOn: () => power.animate(1, POWER_ON_SECONDS),
    powerOff: () => power.animate(0, POWER_OFF_SECONDS),
  };
}
