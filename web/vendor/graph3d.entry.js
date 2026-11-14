import ForceGraph3D from '3d-force-graph';
import SpriteText from 'three-spritetext';
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, SphereGeometry, BoxGeometry, IcosahedronGeometry,
  ConeGeometry, OctahedronGeometry, CanvasTexture, Sprite, SpriteMaterial, AdditiveBlending, Fog, SRGBColorSpace,
  BufferGeometry, Float32BufferAttribute, LineSegments, LineBasicMaterial, DoubleSide,
} from 'three';
window.NTX3D = {
  ForceGraph3D, SpriteText,
  THREE: { Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, SphereGeometry, BoxGeometry, IcosahedronGeometry,
           ConeGeometry, OctahedronGeometry, CanvasTexture, Sprite, SpriteMaterial, AdditiveBlending, Fog, SRGBColorSpace,
           BufferGeometry, Float32BufferAttribute, LineSegments, LineBasicMaterial, DoubleSide },
};
