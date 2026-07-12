import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { FacePose } from '../referenceFace';

/**
 * True-3D reference face: a photoscanned head ("Face Cap" sample model,
 * bundled with three.js examples) with all 52 ARKit morph targets — the exact
 * blendshape vocabulary the caretas are authored in and MediaPipe reports.
 *
 * The model uses _L/_R suffixes (Face Cap convention); we normalize to
 * ARKit's Left/Right when building the name → morph-index map.
 */

interface MorphBinding {
  mesh: THREE.Mesh;
  /** ARKit channel name → morphTargetInfluences index */
  map: Map<string, number>;
}

export class Avatar3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private head: THREE.Object3D | null = null;
  private bindings: MorphBinding[] = [];
  private baseRotY = 0;

  private constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'ref-3d';
    this.canvas.classList.add('hidden');
    container.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
    this.scene.environmentIntensity = 1.15;
    const key = new THREE.DirectionalLight(0xfff4e6, 1.4);
    key.position.set(-0.6, 0.7, 1.2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd9ff, 0.8);
    rim.position.set(0.9, 0.3, -0.7);
    this.scene.add(rim);
  }

  static async create(container: HTMLElement): Promise<Avatar3D> {
    const avatar = new Avatar3D(container);
    const base = import.meta.env.BASE_URL;

    const ktx2 = new KTX2Loader().setTranscoderPath(`${base}basis/`).detectSupport(avatar.renderer);
    const loader = new GLTFLoader();
    loader.setKTX2Loader(ktx2);
    loader.setMeshoptDecoder(MeshoptDecoder);

    const gltf = await loader.loadAsync(`${base}models/facecap.glb`);
    ktx2.dispose();

    avatar.head = gltf.scene;
    avatar.scene.add(gltf.scene);

    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      // The scan's albedo is clay-gray; a warm multiply reads more alive.
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat?.color) mat.color.set(0xf5cfae);
      if (!mesh.morphTargetDictionary) return;
      const map = new Map<string, number>();
      for (const [rawName, idx] of Object.entries(mesh.morphTargetDictionary)) {
        const arkit = rawName.replace(/_L$/, 'Left').replace(/_R$/, 'Right');
        map.set(arkit, idx);
      }
      avatar.bindings.push({ mesh, map });
    });

    // Frame the head: fill ~92% of the viewport height, centered slightly high.
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const fov = (avatar.camera.fov * Math.PI) / 180;
    const dist = (size.y / 0.92) / (2 * Math.tan(fov / 2));
    avatar.camera.position.set(center.x, center.y + size.y * 0.02, center.z + dist);
    avatar.camera.lookAt(center.x, center.y + size.y * 0.02, center.z);

    return avatar;
  }

  render(pose: FacePose): void {
    const canvas = this.canvas;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      this.renderer.setPixelRatio(dpr);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    const { shape, gazeX, gazeY } = pose;
    for (const { mesh, map } of this.bindings) {
      const inf = mesh.morphTargetInfluences!;
      for (const [name, idx] of map) {
        inf[idx] = Math.min(1, Math.max(0, shape[name] ?? 0));
      }
      // Idle eye drift via the model's own eyeLook morphs.
      const gx = Math.min(0.6, Math.abs(gazeX));
      const gy = Math.min(0.5, Math.abs(gazeY));
      setIf(inf, map, gazeX > 0 ? 'eyeLookOutLeft' : 'eyeLookInLeft', gx);
      setIf(inf, map, gazeX > 0 ? 'eyeLookInRight' : 'eyeLookOutRight', gx);
      setIf(inf, map, gazeY > 0 ? 'eyeLookDownLeft' : 'eyeLookUpLeft', gy);
      setIf(inf, map, gazeY > 0 ? 'eyeLookDownRight' : 'eyeLookUpRight', gy);
    }

    if (this.head) {
      // A whisper of head motion so the idle face feels alive.
      this.baseRotY += (gazeX * 0.09 - this.baseRotY) * 0.04;
      this.head.rotation.y = this.baseRotY;
      this.head.rotation.x = gazeY * 0.04;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

function setIf(inf: number[], map: Map<string, number>, name: string, v: number): void {
  const idx = map.get(name);
  if (idx !== undefined) inf[idx] = Math.max(inf[idx], v);
}
