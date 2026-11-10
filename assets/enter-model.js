// "Enter the model": a real model of a villa (assets/villa.json, written from a Hatchline model by tools/export_web_model.py) drawn with three.js while the page scrolls.
// Nothing is downloaded until the section is about to come into view. The three steps of text follow the scroll with or without 3D, so a visitor on a phone that cannot draw it still reads everything.

const root = document.getElementById('enter')
const canvas = document.getElementById('villa')
const photoCanvas = document.getElementById('photo3d')
const stepEls = [...document.querySelectorAll('#steps .step')]
const railEls = []
const numEl = document.getElementById('num')
const barEl = document.getElementById('bar')
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off'

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const smooth = (t) => t * t * (3 - 2 * t)
const progress = () => {
  const r = root.getBoundingClientRect()
  return clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1)
}

// where the camera and the model are at each point of the scroll: azimuth and elevation (degrees), distance (metres), levels pulled apart (0 to 1), and how much of glass, facade features and grounds is shown (0 to 1)
const SPLIT = 0.76                                                                // the model is walked round up to here; after it the same model is shown as a photograph
const KEYS = [
  { p: 0.0, az: 28, el: 62, dist: 76, ex: 0, glass: 0, feat: 0, land: 0, block: 1 },
  { p: 0.3, az: 52, el: 46, dist: 64, ex: 0, glass: 0, feat: 0, land: 0, block: 1 },
  { p: 0.5, az: 82, el: 30, dist: 60, ex: 1, glass: 1, feat: 1, land: 0, block: 0 },
  { p: 0.7, az: 106, el: 26, dist: 60, ex: 1, glass: 1, feat: 1, land: 0, block: 0 },
  { p: 0.88, az: 134, el: 18, dist: 52, ex: 0, glass: 1, feat: 1, land: 1, block: 0 },
  { p: 1.0, az: 152, el: 9, dist: 40, ex: 0, glass: 1, feat: 1, land: 1, block: 0 },
].map((k) => ({ ...k, p: k.p * SPLIT }))
function stateAt(p) {
  let i = 0
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++
  const a = KEYS[i], b = KEYS[i + 1]
  const t = smooth(clamp((p - a.p) / (b.p - a.p), 0, 1))
  const out = {}
  for (const k of Object.keys(a)) if (k !== 'p') out[k] = a[k] + (b[k] - a[k]) * t
  return out
}

function stepFor(p) { return p < 0.26 ? 0 : p < 0.51 ? 1 : p < SPLIT ? 2 : 3 }
function showStep(p) {
  const s = stepFor(p)
  stepEls.forEach((e, i) => e.classList.toggle('on', i === s))
  if (numEl) numEl.textContent = '0' + (s + 1)
  if (barEl) barEl.style.transform = 'scaleX(' + p.toFixed(3) + ')'
  root.classList.toggle('photoview', p > SPLIT + 0.04)
}
showStep(progress())
addEventListener('scroll', () => showStep(progress()), { passive: true })

let started = false
let visible = false
let wake = () => {}
new IntersectionObserver((entries) => {
  visible = entries[0].isIntersecting
  if (visible) wake()
}, { rootMargin: '0px' }).observe(root)
new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !started) { started = true; start().catch((e) => { console.error('enter-model:', e); document.documentElement.classList.add('nogl') }) }
}, { rootMargin: '120% 0px' }).observe(root)

async function start() {
  const [THREE, data] = await Promise.all([import('./vendor/three/three.module.min.js'), fetch('assets/villa.json').then((r) => r.json())])
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch (e) {
    document.documentElement.classList.add('nogl')
    return
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.NeutralToneMapping                                      // pale colours stay pale
  renderer.toneMappingExposure = 1.12

  const W = data.site.w, D = data.site.d
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 400)

  // a painted sky for the glass to reflect: blue overhead, a warm band at the horizon
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256
    const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256)
    grad.addColorStop(0, '#8fb3da'); grad.addColorStop(0.45, '#cfe0ee'); grad.addColorStop(0.5, '#ffd9ae'); grad.addColorStop(0.56, '#e9dcc8'); grad.addColorStop(1, '#d9d2c2')
    g.fillStyle = grad; g.fillRect(0, 0, 512, 256)
    const tex = new THREE.CanvasTexture(c); tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(tex).texture; scene.environmentIntensity = 0.2; tex.dispose(); pm.dispose()
  }


  // light: a low warm sun and a cool sky
  scene.fog = new THREE.Fog(0xeeeadf, 120, 260)                                       // the ground fades into the paper behind it
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0xe9dcc6, 1.5))
  const sun = new THREE.DirectionalLight(0xffd6a0, 2.3)                                // golden hour: low, warm, with long shadows
  sun.position.set(-52, 27, 24)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 1, far: 170 })
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.08                                                            // large flat roofs speckled with the sun's own shadow without it
  scene.add(sun)

  const to3 = (x, y, z) => new THREE.Vector3(x - W / 2, z, -(y - D / 2)) // the model's x east, y north, z up -> the scene's x, y up, z south, the plot centred
  const palette = {
    wall: { c: 0xf3f0e9 }, slab: { c: 0xfbfaf7 }, steel: { c: 0x2a2d31, m: 0.4, r: 0.5 }, concrete: { c: 0xc9c8c2 }, stone: { c: 0xa39b8c }, marble: { c: 0xeeeeee },
    corten: { c: 0x9a6247 }, planting: { c: 0x78a06a }, paint: { c: 0xececec }, solar: { c: 0x3b4b64 }, light: { c: 0xffe2b0, e: 0xffc878, ei: 0.5 }, glass: { c: 0x9cc3de, o: 0.42 },
  }
  const mats = new Map()
  const material = (key) => {
    if (!mats.has(key)) {
      const p = palette[key] || palette.concrete
      const m = key === 'glass'
        ? new THREE.MeshPhysicalMaterial({ color: p.c, roughness: 0.04, metalness: 0.1, transparent: true, opacity: p.o ?? 1, envMapIntensity: 5, clearcoat: 1, clearcoatRoughness: 0.03 })
        : new THREE.MeshStandardMaterial({ color: p.c, roughness: p.r ?? 0.85, metalness: p.m ?? 0, transparent: true, opacity: p.o ?? 1, emissive: p.e ?? 0x000000, emissiveIntensity: p.ei ?? 0 })
      m.userData.base = p.o ?? 1
      if (key === 'glass') m.depthWrite = false
      mats.set(key, m)
    }
    return mats.get(key)
  }

  const groups = { mass: new THREE.Group(), block: new THREE.Group(), glass: new THREE.Group(), feat: new THREE.Group(), land: new THREE.Group() }
  Object.values(groups).forEach((g) => scene.add(g))
  const lifted = [] // meshes of the upper level: pulled up when the levels come apart
  const bounds = new THREE.Box3()
  const unit = new THREE.BoxGeometry(1, 1, 1)

  for (const [kind, lvl, x0, y0, z0, x1, y1, z1, mat] of data.boxes) {
    if (x1 - x0 < 0.005 || y1 - y0 < 0.005 || z1 - z0 < 0.005) continue
    const m = new THREE.Mesh(unit, material(kind === 'glass' ? 'glass' : kind === 'wall' ? 'wall' : kind === 'slab' ? 'slab' : mat))
    const c = to3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    m.position.copy(c)
    m.scale.set(x1 - x0, z1 - z0, y1 - y0)
    m.castShadow = kind !== 'glass'
    m.receiveShadow = true
    ;(kind === 'glass' ? groups.glass : kind === 'feature' ? groups.feat : groups.mass).add(m)
    m.userData.y = c.y
    m.userData.lvl = lvl
    if (lvl > 0) lifted.push(m)
    if (kind === 'wall' || kind === 'slab') bounds.expandByObject(m)
  }
  const centre = bounds.getCenter(new THREE.Vector3())

  // the building as a solid mass, one block to a level: what "blocking it out" looks like before the walls, the glass and the features are there
  const blockMat = new THREE.MeshStandardMaterial({ color: 0xf7f4ee, roughness: 0.9, transparent: true })
  blockMat.userData.base = 1
  data.levels.forEach((lv, i) => {
    const box = new THREE.Box3()
    for (const [kind, lvl, x0, y0, z0, x1, y1, z1] of data.boxes) if (kind === 'wall' && lvl === i) { box.expandByPoint(to3(x0, y0, z0)); box.expandByPoint(to3(x1, y1, z1)) }
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3())
    const m = new THREE.Mesh(unit, blockMat)
    m.position.copy(mid)
    m.scale.set(size.x - 0.12, size.y - 0.12, size.z - 0.12)                     // a hair inside the walls, so the two never fight for the same surface
    m.castShadow = true
    m.receiveShadow = true
    m.userData.y = mid.y
    m.userData.lvl = i
    groups.block.add(m)
    if (i > 0) lifted.push(m)
  })
  // the edges of the boxes, thin and dark: the model reads as a drawing as well as a picture
  const edgeGeo = new THREE.EdgesGeometry(unit)
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x161614, transparent: true, opacity: 0.24 })
  for (const g of [groups.mass, groups.feat]) for (const mesh of [...g.children]) mesh.add(new THREE.LineSegments(edgeGeo, edgeMat))

  // the grounds, as plain shapes
  const landColour = { lawn: 0x93aa7e, paving: 0xd9d3c6, pavers: 0xcdc9bf, path: 0xe6dfd0, driveway: 0xb7b7b2, deck: 0xcdc3b0, pool: 0x74bfd2, pond: 0x5a6c76, bed: 0x6f8a60, planter: 0x7b8870, fence: 0xf6f4ee, steps: 0xa8aaad, firepit: 0x8b8f93, lounger: 0xf7f4ee, outdoor_dining: 0x9a9da1, outdoor_sofa: 0xe8e4da, hedge: 0x6f9a5f }
  for (const [kind, x, y, w, d, r, h] of data.landscape) {
    let mesh
    if (kind === 'tree' || kind === 'palm') {
      const g = new THREE.Group()
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, h * 0.5, 8), new THREE.MeshStandardMaterial({ color: 0x8a7a68, roughness: 1, transparent: true }))
      trunk.position.y = h * 0.25
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshStandardMaterial({ color: 0x7ea36e, roughness: 1, flatShading: true, transparent: true }))
      crown.position.y = h * 0.5 + r * 0.6
      crown.scale.y = 0.85
      g.add(trunk, crown)
      g.position.copy(to3(x, y, 0))
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material.userData.base = 1 } })
      mesh = g
    } else if (kind === 'pot') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, h, 14), new THREE.MeshStandardMaterial({ color: 0x555b62, roughness: 0.6, transparent: true }))
      mesh.position.copy(to3(x, y, h / 2))
      mesh.castShadow = true
    } else {
      const sink = kind === 'pool' || kind === 'pond' ? -0.04 : 0
      mesh = new THREE.Mesh(unit, new THREE.MeshStandardMaterial({ color: landColour[kind] ?? 0x8a8d92, roughness: kind === 'pool' ? 0.08 : 0.95, metalness: kind === 'pool' ? 0.2 : 0, transparent: true }))
      mesh.position.copy(to3(x + w / 2, y + d / 2, h / 2 + sink))
      mesh.scale.set(w, Math.max(h, 0.02), d)
      mesh.castShadow = h > 0.3
    }
    mesh.traverse?.((o) => { if (o.isMesh) { o.receiveShadow = true; o.material.userData.base = 1 } })
    groups.land.add(mesh)
  }

  // the plot: its edge drawn in ink, on a ground that fades into the paper
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.2
  ground.receiveShadow = true
  scene.add(ground)
  const plotFill = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0xebe6da, roughness: 1 }))
  plotFill.rotation.x = -Math.PI / 2
  plotFill.position.y = -0.02
  plotFill.receiveShadow = true
  scene.add(plotFill)
  const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[0, 0], [W, 0], [W, D], [0, D]].map(([x, y]) => to3(x, y, 0.05))), new THREE.LineBasicMaterial({ color: 0x161614 }))
  scene.add(edge)

  // the scroll moves a target state; what is drawn eases towards it
  let cur = stateAt(progress())
  let tgt = cur
  let drag = 0 // degrees turned by hand
  let dragTgt = 0
  let frame = 0
  // the finale: the same model as a photograph, with depth, moved by a small camera (the pointer looks around)
  let pp = null, mx = 0, my = 0, mxT = 0, myT = 0
  import('./parallax.js').then((m) => m.createParallax(THREE, photoCanvas, { img: 'assets/render-pool-1600.webp', depth: 'assets/depth-pool.jpg', aspect: 1.616 })).then((o) => { pp = o; wake() }).catch((e) => console.warn('photo view:', e))
  root.addEventListener('pointermove', (e) => { const r = root.getBoundingClientRect(); mxT = ((e.clientX / innerWidth) - 0.5) * 2; myT = ((e.clientY / innerHeight) - 0.5) * 2; wake() }, { passive: true })
  const apply = () => {
    const P = progress()
    const show = smooth(clamp((P - (SPLIT - 0.06)) / 0.08, 0, 1))                       // the clay model dissolves into the photograph
    photoCanvas.style.opacity = show
    canvas.style.opacity = 1 - show
    if (pp && show > 0.001) pp.set(clamp((P - SPLIT) / (1 - SPLIT), 0, 1), mx, my)
    for (const m of lifted) m.position.y = m.userData.y + cur.ex * 4.6 * m.userData.lvl
    const set = (g, a) => {
      g.visible = a > 0.01
      g.traverse((o) => { if (o.isMesh) o.material.opacity = (o.material.userData.base ?? 1) * a })
    }
    set(groups.block, cur.block)
    set(groups.glass, cur.glass)
    set(groups.feat, cur.feat)
    set(groups.land, cur.land)
    const portrait = camera.aspect < 1 ? 1 + (1 - camera.aspect) * 0.9 : 1 // a phone held upright needs more room
    const az = ((cur.az + drag) * Math.PI) / 180, el = (cur.el * Math.PI) / 180, dist = cur.dist * portrait
    const plotCentre = new THREE.Vector3(0, 0, 0)
    const aim = plotCentre.clone().lerp(new THREE.Vector3(centre.x, 3 + cur.ex * 2.4, centre.z), smooth(clamp(progress() / 0.5, 0, 1)))
    camera.position.set(aim.x + dist * Math.cos(el) * Math.sin(az), aim.y + dist * Math.sin(el), aim.z + dist * Math.cos(el) * Math.cos(az))
    camera.lookAt(aim)
    renderer.render(scene, camera)
  }
  const tick = () => {
    frame = 0
    if (!visible) return
    const k = reduced ? 1 : 0.12
    let moving = false
    for (const key of Object.keys(cur)) {
      const d = tgt[key] - cur[key]
      if (Math.abs(d) > 0.001) { cur[key] += d * k; moving = true } else cur[key] = tgt[key]
    }
    const dd = dragTgt - drag
    if (Math.abs(dd) > 0.05) { drag += dd * (reduced ? 1 : 0.2); moving = true }
    apply()
    if (Math.abs(mxT - mx) + Math.abs(myT - my) > 0.002) { mx += (mxT - mx) * 0.08; my += (myT - my) * 0.08; moving = true }
    if (moving) frame = requestAnimationFrame(tick)
  }
  wake = () => { if (!frame) frame = requestAnimationFrame(tick) }
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    if (w / h > 1.15) camera.setViewOffset(w, h, -w * 0.11, 0, w, h)       // wide: the model moves right, the words have the left
    else camera.clearViewOffset()
    camera.updateProjectionMatrix()
    if (pp) pp.resize()
    wake()
  }
  new ResizeObserver(resize).observe(canvas)
  addEventListener('scroll', () => { tgt = stateAt(progress()); wake() }, { passive: true })

  // a hand on the model turns it
  let down = null
  canvas.addEventListener('pointerdown', (e) => { down = e.clientX; canvas.setPointerCapture(e.pointerId) })
  canvas.addEventListener('pointermove', (e) => {
    if (down === null) return
    dragTgt = clamp(dragTgt + (e.clientX - down) * 0.35, -70, 70)
    down = e.clientX
    wake()
  })
  const up = () => { down = null }
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)

  // the figures in the steps are the model's own
  const f = data.figures
  const put = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text }
  put('f-plot', `${f.plot_w} × ${f.plot_d} m`)
  put('f-foot', `${f.footprint} m²`)
  put('f-cov', `${f.coverage_pct}%`)
  put('f-st', String(f.storeys))
  put('f-h', `${f.height} m`)
  put('f-rooms', String(f.rooms))
  put('f-area', `${f.floor_area} m²`)

  resize()
  tgt = cur = stateAt(progress())
  apply()
  wake()
}
