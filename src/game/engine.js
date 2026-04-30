import * as THREE from 'three';
import { groundTexture, skyTexture } from './textures.js';
import { isMobile } from '../util/detect.js';

export class Engine {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x88ccff, isMobile ? 0.004 : 0.006);
    this._buildSkybox();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !isMobile, powerPreference: 'high-performance', stencil: false, depth: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = !isMobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 12, 24);
    this.camera.lookAt(0, 0, 0);

    this._setupLights();

    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
  }

  _setupLights() {
    const ambient = new THREE.AmbientLight(0xa0c0d0, isMobile ? 1.2 : 0.8);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xfff4e0, 1.5);
    key.position.set(20, 45, 20);
    key.castShadow = !isMobile;
    key.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 500;
    key.shadow.camera.left = -250;
    key.shadow.camera.right = 250;
    key.shadow.camera.top = 250;
    key.shadow.camera.bottom = -250;
    this.scene.add(key);

    // Arena lights for base illumination
    this._arenaLight1 = new THREE.PointLight(0xffeebb, 2.0, 180, 1.2);
    this._arenaLight1.position.set(0, 40, 0);
    this.scene.add(this._arenaLight1);

    const fill = new THREE.PointLight(0x88ccff, 1.5, 160, 1.5);
    fill.position.set(-60, 30, -60);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0xffffff, 1.0, 60, 2);
    rim.position.set(30, 6, 35);
    this.scene.add(rim);
  }

  addGroundMesh({ size }) {
    const tex = groundTexture();
    const geom = new THREE.PlaneGeometry(size, size);
    const mat  = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.1 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = !isMobile;
    this.scene.add(mesh);
  }

  _buildSkybox() {
    const tex    = skyTexture();
    const skyGeo = new THREE.SphereGeometry(400, 32, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
  }

  _onResize() {
    const w = window.innerWidth; const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.renderer.dispose();
  }
}
