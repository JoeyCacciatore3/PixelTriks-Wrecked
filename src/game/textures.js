import * as THREE from 'three'

const loader = new THREE.TextureLoader()
const cache = new Map()

function load(path, opts = {}) {
  const cached = cache.get(path)
  if (cached) {
    if (!opts.unique) return cached
    const copy = cached.clone()
    copy.source = cached.source
    return copy
  }
  const tex = loader.load(path)
  tex.colorSpace = THREE.SRGBColorSpace
  if (opts.repeat) {
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(opts.repeat[0], opts.repeat[1])
  }
  if (opts.nearest) {
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
  }
  cache.set(path, tex)
  return tex
}

export function bulletTexture() {
  return load('textures/firebullet.png', { nearest: true })
}

export function groundTexture() {
  return load('textures/ground.png', { repeat: [10, 20] })
}

export function skyTexture() {
  return load('textures/sky.png')
}

export function wallTexture() {
  return load('textures/wall.png', { repeat: [1, 1] })
}

export function rampTexture(unique = false) {
  return load('textures/ramp.png', { repeat: [1, 1], unique })
}

export function pillarTexture(unique = false) {
  return load('textures/pillar.png', { repeat: [1, 1], unique })
}

export function barrelTexture() {
  return load('textures/barrel.png', { nearest: true })
}

export function heartTexture() {
  return load('textures/heart.png')
}

const CAR_TEXTURE_MAP = {
  '#ef4444': 'textures/car_body_red.png',
  '#22c55e': 'textures/car_body_green.png',
  '#3b82f6': 'textures/car_body_blue.png',
  '#eab308': 'textures/car_body_yellow.png',
}

export function carBodyTexture(color = '#ef4444', isAI = false) {
  if (isAI) return load('textures/ai_car_body_silver.png', { nearest: true })
  
  // Create a unique "Hero" texture for human players
  return createHeroTexture(color)
}

function createHeroTexture(color) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  
  // Base color
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 512, 512)
  
  // Racing Stripes (Gold)
  ctx.fillStyle = '#fbbf24'
  ctx.fillRect(180, 0, 40, 512)
  ctx.fillRect(292, 0, 40, 512)
  
  // Star Motifs (White)
  ctx.fillStyle = '#ffffff'
  for (let i = 0; i < 12; i++) {
    const x = (i % 3) * 150 + 100
    const y = Math.floor(i / 3) * 120 + 60
    drawStar(ctx, x, y, 5, 18, 8)
  }
  
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  return tex
}

function drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
  let rot = Math.PI / 2 * 3
  let x = cx
  let y = cy
  let step = Math.PI / spikes

  ctx.beginPath()
  ctx.moveTo(cx, cy - outerRadius)
  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius
    y = cy + Math.sin(rot) * outerRadius
    ctx.lineTo(x, y)
    rot += step

    x = cx + Math.cos(rot) * innerRadius
    y = cy + Math.sin(rot) * innerRadius
    ctx.lineTo(x, y)
    rot += step
  }
  ctx.lineTo(cx, cy - outerRadius)
  ctx.closePath()
  ctx.fill()
}
