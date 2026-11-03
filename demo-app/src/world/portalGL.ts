/**
 * The Doorlink portal as one small WebGL fragment shader (no 3D engine on
 * the homepage). A logarithmic swirl of Doorlink blues around a disk that
 * looks into Doorlink World; `travel` 0→1 accelerates the swirl, grows the
 * disk past the screen edges with a radial motion blur, then unwinds it so
 * it lands exactly on the full-screen glimpse the live world fades in under.
 */

const VERT = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`

const FRAG = `precision highp float;
varying vec2 vUv;
uniform vec2 uRes, uCenter;
uniform float uRadius, uTime, uTravel, uReveal, uZoom, uTexAspect, uHasTex, uBlur;
uniform sampler2D uTex;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

vec3 world(vec2 px) {
  vec2 uv = px / uRes;
  float sa = uRes.x / uRes.y;
  vec2 s = sa > uTexAspect ? vec2(1.0, uTexAspect / sa) : vec2(sa / uTexAspect, 1.0);
  uv = (uv - 0.5) * s + 0.5;
  vec3 sky = mix(vec3(0.80, 0.88, 0.95), vec3(0.55, 0.72, 0.92), uv.y);
  return mix(sky, texture2D(uTex, clamp(uv, 0.002, 0.998)).rgb, uHasTex);
}

void main() {
  vec2 px = vUv * uRes;
  vec2 d = px - uCenter;
  float r = length(d);
  float k = r / uRadius;
  float a = atan(d.y, d.x);
  float unwind = 1.0 - smoothstep(0.7, 1.0, uTravel);
  float spin = uTime * (0.3 + uTravel * 3.2);

  // Inside: the world, twisted towards the rim and drawn in from depth.
  float twist = pow(clamp(k, 0.0, 1.0), 2.6) * (0.65 + uTravel * 3.4) * unwind + sin(uTime * 0.5) * 0.03 * unwind;
  vec2 q = rot(d, twist) * uZoom;
  vec2 centre = uRes * 0.5;
  vec3 inner = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    float f = 1.0 - float(i) * 0.035 * uBlur;
    inner += world(centre + q * f);
  }
  inner /= 6.0;
  // A cool atmospheric haze where the view meets the rim.
  inner = mix(inner, vec3(0.78, 0.88, 1.0), smoothstep(0.55, 1.0, k) * 0.55 * unwind);
  float inside = 1.0 - smoothstep(0.93, 1.0, k);

  // The swirl: spiral arms in Doorlink blues, a bright rim and drifting glints.
  float arms = 0.5 + 0.5 * sin(a * 3.0 - log(max(k, 0.04)) * 7.0 + spin * 3.0);
  arms = pow(arms, 2.2);
  float band = smoothstep(0.6, 1.0, k) * (1.0 - smoothstep(1.0, 1.75, k));
  float rim = exp(-pow((k - 1.0) * 7.0, 2.0));
  float halo = k > 1.0 ? exp(-(k - 1.0) * 3.0) * 0.35 : 0.0;
  vec2 g = vec2(a * 24.0 + spin * 5.0, log(max(k, 0.04)) * 26.0 - uTime * 3.0);
  float glint = step(0.975, hash(floor(g))) * smoothstep(0.32, 0.0, length(fract(g) - 0.5)) * band;
  vec3 blue = vec3(0.09, 0.41, 0.82);
  vec3 light = vec3(0.62, 0.80, 1.0);
  vec3 glow = mix(blue, light, arms) * band * (0.25 + arms) + vec3(0.9, 0.95, 1.0) * rim * 0.9 + light * halo + vec3(1.0) * glint;
  glow *= unwind * 0.85 + 0.15;

  vec3 col = inner * inside + glow * (1.0 - inside * 0.6);
  float alpha = clamp(max(inside, max(max(glow.r, glow.g), glow.b)), 0.0, 1.0) * uReveal;
  gl_FragColor = vec4(col * uReveal, alpha);
}`

export interface PortalUniforms {
  centerX: number
  centerY: number
  radius: number
  travel: number
  reveal: number
  zoom: number
  blur: number
}

export interface PortalRenderer {
  draw: (u: PortalUniforms, time: number) => void
  resize: () => void
  destroy: () => void
}

/** Returns null where WebGL is unavailable; the caller shows the CSS portal instead. */
export function createPortalRenderer(canvas: HTMLCanvasElement, imageSrc: string, maxDpr = 1.5): PortalRenderer | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: 'high-performance' })
  if (!gl) return null
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
  }
  const vs = compile(gl.VERTEX_SHADER, VERT)
  const fs = compile(gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return null
  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null
  gl.useProgram(prog)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'p')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  const U = (n: string) => gl.getUniformLocation(prog, n)
  const u = {
    res: U('uRes'), center: U('uCenter'), radius: U('uRadius'), time: U('uTime'), travel: U('uTravel'), reveal: U('uReveal'),
    zoom: U('uZoom'), texAspect: U('uTexAspect'), hasTex: U('uHasTex'), blur: U('uBlur'),
  }
  gl.uniform1f(u.hasTex, 0)
  gl.uniform1f(u.texAspect, 1.6)

  const tex = gl.createTexture()
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.uniform1f(u.hasTex, 1)
    gl.uniform1f(u.texAspect, img.naturalWidth / img.naturalHeight)
  }
  img.src = imageSrc

  let dpr = 1
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    gl.viewport(0, 0, canvas.width, canvas.height)
  }
  resize()

  return {
    resize,
    draw: (s, time) => {
      gl.uniform2f(u.res, canvas.width, canvas.height)
      // Positions arrive in CSS pixels from the top-left; GL wants device pixels from the bottom-left.
      gl.uniform2f(u.center, s.centerX * dpr, canvas.height - s.centerY * dpr)
      gl.uniform1f(u.radius, Math.max(1, s.radius * dpr))
      gl.uniform1f(u.time, time)
      gl.uniform1f(u.travel, s.travel)
      gl.uniform1f(u.reveal, s.reveal)
      gl.uniform1f(u.zoom, s.zoom)
      gl.uniform1f(u.blur, s.blur)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    destroy: () => {
      img.onload = null
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
