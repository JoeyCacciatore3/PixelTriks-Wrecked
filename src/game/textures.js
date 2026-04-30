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
  const path = CAR_TEXTURE_MAP[color] || CAR_TEXTURE_MAP['#ef4444']
  return load(path, { nearest: true })
}
