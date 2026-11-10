// "From model to photograph": three real renders made from Hatchline models, wiped in by the scroll. Each is its own picture; they are not one camera.
const root = document.getElementById('photos')
if (root) {
  const slides = [...root.querySelectorAll('.ph')]
  const caps = [...root.querySelectorAll('.pc')]
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off'
  // each picture is a photograph with depth (assets/parallax.js): a small camera pushes in and drifts as the scroll moves, and the pointer looks around
  const views = slides.map(() => null)
  let mx = 0, my = 0
  let started = false
  const startViews = async () => {
    if (started) return
    started = true
    try {
      const [THREE, { createParallax }] = await Promise.all([import('./vendor/three/three.module.min.js'), import('./parallax.js')])
      for (let i = 0; i < slides.length; i++) {
        const c = document.createElement('canvas')
        slides[i].appendChild(c)
        views[i] = await createParallax(THREE, c, { img: slides[i].dataset.img, depth: slides[i].dataset.depth, aspect: 1.616 })
        slides[i].classList.add('deep')
      }
      update()
    } catch (e) { console.warn('photo views:', e) }
  }
  addEventListener('pointermove', (e) => { mx = (e.clientX / innerWidth - 0.5) * 2; my = (e.clientY / innerHeight - 0.5) * 2; if (views.some(Boolean)) update() }, { passive: true })
  const update = () => {
    const r = root.getBoundingClientRect()
    const p = clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1) * (slides.length - 1)
    slides.forEach((s, i) => {
      const a = i === 0 ? 1 : clamp(p - (i - 1), 0, 1)                          // slide i wipes in over the one before it
      s.style.clipPath = reduced ? (a > 0.5 ? 'inset(0)' : 'inset(0 0 100% 0)') : `inset(${(1 - a) * 100}% 0 0 0)`
      const img = s.querySelector('img')
      if (views[i]) {
        if (img) img.style.visibility = 'hidden'
        const covered = i < slides.length - 1 && clamp(p - i, 0, 1) >= 1                // a later picture has fully covered this one
        if (a > 0 && !covered) views[i].set(clamp((p - (i - 1)) / 2, 0, 1), reduced ? 0 : mx, reduced ? 0 : my)
      } else if (img) img.style.transform = `scale(${1.12 - 0.12 * a})`
    })
    const idx = Math.round(p)
    caps.forEach((c, i) => c.classList.toggle('on', i === idx))
    const bar = document.getElementById('phbar')
    if (bar) bar.style.transform = `scaleX(${(p / (slides.length - 1)).toFixed(3)})`
  }
  const near = () => { const r = root.getBoundingClientRect(); return r.top < innerHeight * 2 && r.bottom > -innerHeight }
  addEventListener('scroll', () => { if (!started && near()) startViews(); update() }, { passive: true })
  if (near()) startViews()
  addEventListener('resize', () => { views.forEach((v) => v && v.resize()); update() })
  update()
}
