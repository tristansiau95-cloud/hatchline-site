// A photograph with depth: a render and its depth map (both made from a Hatchline model) are drawn as a relief, and a small virtual camera moves across it,
// so the picture has parallax like a film shot. The depth map is the model's own, so near walls move more than far ones; trees and other things the
// renderer added have no depth of their own and move with the ground behind them.

export async function createParallax(THREE, canvas, { img, depth, amp = 0.38, aspect = 1.616 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 60)
  const load = (url, srgb) => new Promise((ok, no) => new THREE.TextureLoader().load(url, (t) => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    t.generateMipmaps = false
    t.minFilter = THREE.LinearFilter
    ok(t)
  }, undefined, no))
  const [map, dmap] = await Promise.all([load(img, true), load(depth, false)])

  const H = 2, W = H * aspect
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, dmap: { value: dmap }, amp: { value: amp } },
    vertexShader: `
      uniform sampler2D dmap; uniform float amp; varying vec2 vUv;
      void main() {
        vUv = uv;
        float d = texture2D(dmap, uv).r;
        vec3 p = position; p.z += (d - 0.4) * amp;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map; varying vec2 vUv;
      void main() {
        vec3 c = texture2D(map, vUv).rgb;
        float v = smoothstep(1.05, 0.25, length(vUv - 0.5) * 1.35);
        c *= mix(0.72, 1.0, v);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  })
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(W, H, 200, 124), material))

  let fit = 1
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return false
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const m = 1.1                                                                         // the picture is a little larger than the view, so the camera has room to move
    fit = Math.min(H / m, W / m / camera.aspect) / (2 * Math.tan((camera.fov * Math.PI) / 360))
    return true
  }
  resize()

  // p: 0 to 1 along the move (a slow push-in and a sideways drift); mx, my: the pointer, -1 to 1
  const set = (p, mx = 0, my = 0) => {
    const e = p * p * (3 - 2 * p)
    camera.position.set((-0.05 + 0.1 * e) + mx * 0.03, 0.02 - 0.04 * e + my * 0.015, fit * (1 - 0.06 * e))
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
  }
  return { set, resize, canvas, dispose: () => { renderer.dispose(); map.dispose(); dmap.dispose() } }
}
