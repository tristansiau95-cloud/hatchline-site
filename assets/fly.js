// "Fly around": a short film of a Hatchline model, played forwards and backwards by the scroll (a scrubbed film).
// The film is not downloaded until the section is near; with reduced motion, or if it will not play, the still picture and the words remain.
const root = document.getElementById('fly')
const video = document.getElementById('flyvideo')
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'off'
const lines = [...document.querySelectorAll('#fly .fl')]
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const progress = () => {
  const r = root.getBoundingClientRect()
  return clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1)
}
function words(p) {
  const i = p < 0.33 ? 0 : p < 0.68 ? 1 : 2
  lines.forEach((el, k) => el.classList.toggle('on', k === i))
  const bar = document.getElementById('flybar')
  if (bar) bar.style.transform = 'scaleX(' + p.toFixed(3) + ')'
}
words(progress())
addEventListener('scroll', () => words(progress()), { passive: true })

if (!reduced && video) {
  let loaded = false, target = 0, shown = 0, raf = 0
  const seek = () => {
    raf = 0
    if (!video.duration) return
    shown += (target - shown) * 0.18
    if (Math.abs(target - shown) < 0.002) shown = target
    const t = shown * (video.duration - 0.05)
    if (Math.abs(video.currentTime - t) > 0.01 && !video.seeking) video.currentTime = t
    if (shown !== target) raf = requestAnimationFrame(seek)
  }
  const near = () => { const r = root.getBoundingClientRect(); return r.top < innerHeight * 2.5 && r.bottom > -innerHeight }
  const wake = () => { if (!loaded && near()) load(); target = progress(); if (!raf) raf = requestAnimationFrame(seek) }
  const load = () => {
    if (loaded) return
    loaded = true
    video.addEventListener('loadedmetadata', () => { root.classList.add('ready'); wake() }, { once: true })
    video.addEventListener('error', () => root.classList.remove('ready'), { once: true })
    video.src = video.dataset.src
    video.load()
  }
  new IntersectionObserver((e) => { if (e[0].isIntersecting) load() }, { rootMargin: '150% 0px' }).observe(root)
  addEventListener('scroll', wake, { passive: true })
  addEventListener('resize', wake)
  wake()
}
