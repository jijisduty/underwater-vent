import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
//import GUI from "three/addons/libs/lil-gui.module.min.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
// import vertexShaderGrad from "./shaders/bgGradient/vertex.glsl";
// import fragmentShaderGrad from "./shaders/bgGradient/fragment.glsl";
// import vertexShader from "./shaders/bgWater/vertex.glsl";
// import fragmentShader from "./shaders/bgWater/fragment.glsl";
// import heatFadedSmokeVertexShader from "./shaders/smoke/vertex.glsl";
// import heatFadedSmokeFragmentShader from "./shaders/smoke/fragment.glsl";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
// import fragmentShaderVelocity from "./shaders/fishVelocity/fragment.glsl";
// import fragmentShaderPosition from "./shaders/fishPosition/fragment.glsl";
// import fragmentShaderVentSmoke from "./shaders/ventSmoke/fragment.glsl";
// import vertexShaderVentSmoke from "./shaders/ventSmoke/vertex.glsl";
// import vertexShaderFish from "./shaders/fish/vertex.glsl";
// import fragmentShaderFish from "./shaders/fish/fragment.glsl";

import { ImprovedNoise } from "three/addons/math/ImprovedNoise.js";

/**
 * Base
 */
// Debug
const gui = new GUI({ width: 340 });

// Canvas
//const canvas = document.querySelector("canvas.webgl");

// Vertex Shader
const vertexShader = `
uniform mat4 textureMatrix;
		varying vec4 vUv;

		#include <common>
		#include <logdepthbuf_pars_vertex>

		void main() {

			vUv = textureMatrix * vec4( position, 1.0 );

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

			#include <logdepthbuf_vertex>

		}
`;

// Fragment Shader
const fragmentShader = `


   uniform vec3 color;
   uniform sampler2D tDiffuse;
   varying vec4 vUv;
   uniform sampler2D tDudv;
   uniform float time;
   uniform float waveStrength;
   uniform float waveSpeed;

   #include <logdepthbuf_pars_fragment>

   void main() {

       #include <logdepthbuf_fragment>

       float waveStrength = 0.09;
       float waveSpeed = 0.005;


        vec2 distortedUv = texture2D( tDudv, vec2( vUv.x + time * waveSpeed, vUv.y ) ).rg * waveStrength;
        distortedUv = vUv.xy + vec2( distortedUv.x, distortedUv.y + time * waveSpeed );
        vec2 distortion = ( texture2D( tDudv, distortedUv ).rg * 2.0 - 1.0 ) * waveStrength;

        // new uv coords

        vec4 uv = vec4( vUv );
        uv.xy += distortion;

       vec4 base = texture2DProj( tDiffuse, uv );
       gl_FragColor = vec4( mix( base.rgb, color, 0.8 ), 1.0 );

       #include <tonemapping_fragment>
       #include <colorspace_fragment>

   }
`;

// Vertex Shader
const vertexShaderGrad = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
// Fragment Shader
const fragmentShaderGrad = `
uniform vec2 u_resolution;
uniform float red;
uniform float green;
uniform float blue;
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(${window.innerWidth}, ${window.innerHeight});
  vec3 col = 0.18 - 0.78 * cos(uv.y + vec3(red, green, blue));
  gl_FragColor = vec4(col, 1.0);
  
}

`;

// Vertex Shader
const heatFadedSmokeFragmentShader = `
uniform float uTime;
uniform sampler2D uPerlinTexture;

varying vec2 vUv;

void main()
{
    // Scale and animate
    vec2 smokeUv = vUv;
    //smokeUv.x *= 0.5;
    smokeUv.y *= -0.3;
    smokeUv.y -= uTime * -0.03;

    // Smoke
    float smoke = texture(uPerlinTexture, smokeUv).r;

    // Remap
    smoke = smoothstep(0.1, 1.2, smoke);

    // Edges
    smoke *= smoothstep(0.0, 0.1, vUv.x);
    smoke *= smoothstep(1.0, 0.9, vUv.x);
    smoke *= smoothstep(0.7, 0.1, vUv.y);
    smoke *= smoothstep(0.0, 0.4, vUv.y);

    // Final color
    gl_FragColor = vec4(0.19, 0.39, 0.67, smoke);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}
`;
// Fragment Shader
const heatFadedSmokeVertexShader = `
uniform float uTime;
uniform sampler2D uPerlinTexture;

varying vec2 vUv;

vec2 rotate2D(vec2 value, float angle)
{
    float s = sin(angle);
    float c = cos(angle);
    mat2 m = mat2(c, s, -s, c);
    return m * value;
}

void main()
{
    vec3 newPosition = position;

    // Twist
    float twistPerlin = texture2D(
        uPerlinTexture,
        vec2(0.05, uv.y * 0.002 - uTime * 0.005)
    ).r;
    float angle = twistPerlin * 2.0;
    newPosition.xz = rotate2D(newPosition.xz, angle);

    // Wind (commented out, but can be used if needed)
    // vec2 windOffset = vec2(
    //     texture2D(uPerlinTexture, vec2(0.25, uTime * 0.01)).r - 0.5,
    //     texture2D(uPerlinTexture, vec2(0.75, uTime * 0.01)).r - 0.5
    // );
    // windOffset *= pow(uv.y, 2.0) * 10.0;
    // newPosition.xz += windOffset;

    // Final position
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);

    // Varyings
    vUv = uv;
}


`;

const fragmentShaderVelocity = `
uniform float time;
uniform float testing;
uniform float delta; // about 0.016
uniform float separationDistance; // 20
uniform float alignmentDistance; // 40
uniform float cohesionDistance; //
uniform float freedomFactor;
uniform vec3 predator;

const float width = resolution.x;
const float height = resolution.y;

const float PI = 3.141592653589793;
const float PI_2 = PI * 2.0;
// const float VISION = PI * 0.55;

float zoneRadius = 10.0;
float zoneRadiusSquared = 1000.0;

float separationThresh = 0.45;
float alignmentThresh = 0.65;

const float UPPER_BOUNDS = BOUNDS;
const float LOWER_BOUNDS = -UPPER_BOUNDS;

const float SPEED_LIMIT = 6.0;

// float rand( vec2 co ){
// 	return fract( sin( dot( co.xy, vec2(12.9898,78.233) ) ) * 43758.5453 );
// }

void main() {

  zoneRadius = separationDistance + alignmentDistance + cohesionDistance;
  separationThresh = separationDistance / zoneRadius;
  alignmentThresh = ( separationDistance + alignmentDistance ) / zoneRadius;
  zoneRadiusSquared = zoneRadius * zoneRadius;


  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 fishPosition, fishVelocity;

  vec3 selfPosition = texture2D( texturePosition, uv ).xyz;
  vec3 selfVelocity = texture2D( textureVelocity, uv ).xyz; //play here

  float dist;
  vec3 dir; // direction
  float distSquared;

  float separationSquared = separationDistance * separationDistance;
  float cohesionSquared = cohesionDistance * cohesionDistance;

  float f;
  float percent;

  vec3 velocity = selfVelocity;

  float limit = SPEED_LIMIT;

  dir = predator * UPPER_BOUNDS - selfPosition;
  dir.z = 0.;
  // dir.z *= 0.6;
  dist = length( dir );
  distSquared = dist * dist;

  float preyRadius = 280.0;
  float preyRadiusSq = preyRadius * preyRadius;


  // move fishs away from predator
  if ( dist < preyRadius ) {

    f = ( distSquared / preyRadiusSq - 1.0 ) * delta * 2000.; //play here
    velocity += normalize( dir ) * f *1.2;
    limit += 5.0;
  }

  // Attract flocks to the center
  vec3 central = vec3( 0., 0., 0. );
  dir = selfPosition - central;
  dist = length( dir );

  dir.y *= 2.5;
  velocity -= normalize( dir ) * delta * 1.;

  for ( float y = 0.0; y < height; y++ ) {
    for ( float x = 0.0; x < width; x++ ) {

      vec2 ref = vec2( x + 0.5, y + 0.5 ) / resolution.xy;
      fishPosition = texture2D( texturePosition, ref ).xyz;

      dir = fishPosition - selfPosition;
      dist = length( dir );

      if ( dist < 0.0001 ) continue;

      distSquared = dist * dist;

      if ( distSquared > zoneRadiusSquared ) continue;

      percent = distSquared / zoneRadiusSquared;

      if ( percent < separationThresh ) { // low

        // Separation - Move apart for comfort
        f = ( separationThresh / percent - 1.0 ) * delta;
        velocity -= normalize( dir ) * f;

      } else if ( percent < alignmentThresh ) { // high

        // Alignment - fly the same direction
        float threshDelta = alignmentThresh - separationThresh;
        float adjustedPercent = ( percent - separationThresh ) / threshDelta;

        fishVelocity = texture2D( textureVelocity, ref ).xyz;

        f = ( 0.5 - cos( adjustedPercent * PI_2 ) * 0.5 + 0.5 ) * delta;
        velocity += normalize( fishVelocity ) * f;

      } else {

        // Attraction / Cohesion - move closer
        float threshDelta = 1.0 - alignmentThresh;
        float adjustedPercent;
        if( threshDelta == 0. ) adjustedPercent = 1.;
        else adjustedPercent = ( percent - alignmentThresh ) / threshDelta;

        f = ( 0.5 - ( cos( adjustedPercent * PI_2 ) * -0.5 + 0.5 ) ) * delta;

        velocity += normalize( dir ) * f;

      }

    }

  }



  // this make tends to fly around than down or up
  // if (velocity.y > 0.) velocity.y *= (1. - 0.2 * delta);

  // Speed Limits
  if ( length( velocity ) > limit ) {
    velocity = normalize( velocity ) * limit;
  }

  gl_FragColor = vec4( velocity, 0.5 );

}

`;

const fragmentShaderPosition = `
uniform float time;
uniform float delta;

void main()	{

  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec4 tmpPos = texture2D( texturePosition, uv );
  vec3 position = tmpPos.xyz;
  vec3 velocity = texture2D( textureVelocity, uv ).xyz;

  float phase = tmpPos.w;

  phase = mod( ( phase + delta +
    length( velocity.xz ) * delta * 9. +
    max( velocity.y, 10.0 ) * delta * 6. ), 62.83 );

  gl_FragColor = vec4( position + velocity * delta * 15. , phase );

}
`;

const vertexShaderFish = `
attribute vec2 reference;
attribute float fishVertex;

attribute vec3 fishColor;

uniform sampler2D texturePosition;
uniform sampler2D textureVelocity;

varying vec4 vColor;
varying float z;

uniform float time;

void main() {

  vec4 tmpPos = texture2D( texturePosition, reference );
  vec3 pos = tmpPos.xyz;
  vec3 velocity = normalize(texture2D( textureVelocity, reference ).xyz);

  vec3 newPosition = position;

  if ( fishVertex == 4.0 || fishVertex == 7.0 ) {
    // flap wings
    newPosition.y = sin( tmpPos.w ) * 5.;
  }

  newPosition = mat3( modelMatrix ) * newPosition;


  velocity.z *= -.93;
  float xz = length( velocity.xz );
  float xyz = 1.;
  float x = sqrt( 1. - velocity.y * velocity.y );

  float cosry = velocity.x / xz;
  float sinry = velocity.z / xz;

  float cosrz = x / xyz;
  float sinrz = velocity.y / xyz;

  mat3 maty =  mat3(
    cosry, 0, -sinry,
    0    , 1, 0     ,
    sinry, 0, cosry

  );

  mat3 matz =  mat3(
    cosrz , sinrz, 0,
    -sinrz, cosrz, 0,
    0     , 0    , 1
  );

  newPosition =  maty * matz * newPosition;
  newPosition += pos;

  z = newPosition.z;

  vColor = vec4( fishColor, 0.8 );
  gl_Position = projectionMatrix *  viewMatrix  * vec4( newPosition, 0.5 );
}

`;

const fragmentShaderFish = `
varying vec4 vColor;
varying float z;

uniform vec3 color;

void main() {
  // Fake colors for now
  float z2 = 0.2 + ( 1000. - z ) / 1000. * vColor.x;
  gl_FragColor = vec4( z2, z2, z2, .5 );

}
`;

const fragmentShaderVentSmoke = `
precision highp float;
precision highp sampler3D;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

in vec3 vOrigin;
in vec3 vDirection;

out vec4 color;

uniform vec3 base;
uniform sampler3D map;

uniform float threshold;
uniform float range;
uniform float opacity;
uniform float steps;
uniform float frame;
uniform float uTime;
in vec2 vUv;



uint wang_hash(uint seed)
{
    seed = (seed ^ 61u) ^ (seed >> 16u);
    seed *= 9u;
    seed = seed ^ (seed >> 4u);
    seed *= 0x27d4eb2du;
    seed = seed ^ (seed >> 15u);
    return seed;
}

float randomFloat(inout uint seed)
{
    return float(wang_hash(seed)) / 4294967296.;
}

vec2 hitBox( vec3 orig, vec3 dir ) {
  const vec3 box_min = vec3( - 0.5 );
  const vec3 box_max = vec3( 0.5 );
  vec3 inv_dir = 1.0 / dir;
  vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
  vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
  vec3 tmin = min( tmin_tmp, tmax_tmp );
  vec3 tmax = max( tmin_tmp, tmax_tmp );
  float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
  float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
  return vec2( t0, t1 );
}

float sample1( vec3 p ) {
  return texture( map, p ).r;
}

float shading( vec3 coord ) {
  float step = 0.01;
  return sample1( coord + vec3( - step ) ) - sample1( coord + vec3( step ) );
}

// vec4 linearToSRGB( in vec4 value ) {
// 	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
// }

void main(){
  vec2 smokeUv = vUv;
      smokeUv.y *= -0.9;
       // smokeUv.y += uTime * -0.03;
     float loopTime = mod(uTime, 120.0);
     smokeUv.y += sin(loopTime * opacity) -2.0;
     smokeUv.x -= sin(loopTime) * -0.0008;
    // smokeUv.y += loopTime * -0.03;

  vec3 rayDir = normalize( vDirection );
  
  
  vec2 bounds = hitBox( vOrigin, rayDir );

  if ( bounds.x > bounds.y ) discard;

  bounds.x = max( bounds.x, 0.0 );

  vec3 p = vOrigin + bounds.x * rayDir;
  vec3 inc = 1.0 / abs( rayDir );
  float delta = min( inc.x, min( inc.y, inc.z ) ) ;
  delta /= steps*2.0;

  // Jitter

  // uint seed = uint( gl_FragCoord.x ) * uint( 1973 ) + uint( gl_FragCoord.y ) * uint( 9277 ) + uint( frame ) * uint( 26699 );
  // vec3 size = vec3( textureSize( map, 0 ) );
  // float randNum = randomFloat( seed ) * 2.0 - 1.0;
  // p += rayDir *  vec3(0.9, smokeUv);

  //

  vec4 ac = vec4( base, 0.0 );

  for ( float t = bounds.x; t < bounds.y; t += delta ) {

    float d = sample1( p + 0.4 );

    d = smoothstep( threshold - range, threshold + range, d ) * opacity;

    float col = shading( p + 0.5 ) * 3.0 + ( ( p.x + p.y ) * 0.25 ) + 0.2;

    ac.rgb += ( 1.0 - ac.a ) * d * col;

    ac.a += ( 1.0 - ac.a ) * d;

    if ( ac.a >= 0.95 ) break;

    p += rayDir * delta;

  }

  //color =  ac * vec4(2.8, 1.9, 1.7, 1.3);
  color =  ac * vec4(0.8, 3.5, 3.5, 1.0);
 //color =  ac * vec4(2.2,3.5,3.7, 1.2);
 //color =  ac * vec4(5.0,4.3,4.45, 1.2);
  

//	if ( color.a == 0.0 ) discard;

}
`;

const vertexShaderVentSmoke = `
in vec3 position;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
          uniform vec3 smokeLength;
          uniform float uTime;

out vec3 vOrigin;
out vec3 vDirection;
uniform sampler2D uPerlinTexture;
in vec2 uv;

out vec2 vUv;

vec2 rotate2D(vec2 value, float angle)
{
float s = sin(angle);
float c = cos(angle);
mat2 m = mat2(c, s, -s, c);
return m * value;
}


void main() {
  vec3 originalPosition = position;
  float twistPerlin = texture(uPerlinTexture, vec2(uTime * 0.1, uv.y * 0.1)).r;
  float angle = twistPerlin * 2.0 * 3.14159; // Convert to radians
  //vec3 twistedPosition = rotate2D(originalPosition.xz, angle);
  
  vec4 mvPosition = modelViewMatrix * vec4( position, .5   );


  vOrigin = vec3( inverse( modelMatrix ) * vec4( smokeLength, 0.9 ) ).xyz;
  vDirection = position - vOrigin;

  gl_Position = projectionMatrix * mvPosition;
}
`;

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

//let container;
let mouseX = 0,
  mouseY = 0;
let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;

//container.appendChild(renderer.domElement);
document.body.style.touchAction = "none";
document.body.addEventListener("pointermove", onPointerMove);

const BOUNDS = 800,
  BOUNDS_HALF = BOUNDS / 2;

let last = performance.now();

// container = document.createElement("div");
// document.body.appendChild(container);

// Scene
const scene = new THREE.Scene();

/**
 * Sizes
 */
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

window.addEventListener("resize", () => {
  // Update sizes
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // Update camera
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  // Update renderer
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(
  162,
  window.innerWidth / window.innerHeight,
  0.1,
  3000
);
//camera.position.z = -3000;

const particlesCamera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  1,
  100000
);

//3D model camera
const ventCamera = new THREE.PerspectiveCamera(
  162,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

/**
 * Fog
 */

scene.fog = new THREE.Fog(0x031a30, 1, 1000);
scene.fog.near = 1.3;
scene.fog.far = 0.09;

//3D model camera controls
// gui.add(ventCamera.position, "x", -10000, 10000, 0.1).name("ventCamX");
// gui.add(ventCamera.position, "y", -10000, 10000, 0.1).name("ventCamY");
// gui.add(ventCamera.position, "z", -10000, 10000, 0.1).name("ventCamZ");
// gui.add(ventCamera.rotation, "x", -100, 100, 0.001).name("ventCamXRot");
// gui.add(ventCamera.rotation, "y", -100, 100, 0.001).name("ventCamYRot");
// gui.add(ventCamera.rotation, "z", -100, 100, 0.001).name("ventCamZRot");
ventCamera.rotation.z = 0.42;
ventCamera.layers.enable(3);

ventCamera.position.x = -2.531;
ventCamera.position.y = -0.178;
ventCamera.position.z = 0.217;
//ventCamera.position.y = -0.458;

particlesCamera.position.z = 3200;

camera.rotation.x = -8;
particlesCamera.rotation.x = -8;

/**
 * Camera Layers
 */
camera.layers.enable(0); // Main camera sees default layer
camera.layers.enable(1);

// LOADER
// Instantiate a loader
const loader = new GLTFLoader();

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("draco/");

loader.setDRACOLoader(dracoLoader);

var ventModel;
var ventModelLoaded = false;

function loadModel(url) {
  return new Promise((resolve, reject) => {
    loader.load(
      "scene-v2-v3.glb",
      (glb) => {
        resolve(glb.scene);
        ventModel = glb.scene;
        scene.add(ventModel);
        console.log(ventModel.size);
        //ventModel.position.y = -1;
        ventModel.scale.set(0.7, 0.4, 0.7);
        // ventModel.rotation.x = 8.2;
        // ventModel.rotation.x = 42.6;
        // ventModel.position.y = -4.1;
        ventModel.rotation.x = 17.549;
        ventModel.rotation.y = 12.2;
        ventModel.rotation.z = 0.08;
        // ventModel.position.x = 1.9647;
        // ventModel.position.y = -2.2;
        // ventModel.position.z = -0.08;
        ventModel.position.x = -0.599; //2.082;

        ventModel.position.y = -2.819; //-2.762;
        ventModel.position.z = -0.408; //-0.241;

        // ventModel.rotation.x = 0.08;
        //ventModel.rotation.x = -0.5;
        ventModelLoaded = true;
        //transparent = true;
        //opacity = 0.8;

        ventModel.traverse((child) => {
          if (child.isMesh) {
            child.layers.set(3);
          }
        });
      },
      undefined,
      (error) => {
        reject(error);
      }
    );
  });
}

// loader.colorSpace = THREE.SRGBColorSpace;
// loader.anisotropy = 8;

loadModel("scene-v2-v3.glb").then(() => {
  if (ventModelLoaded) {
    console.log("Hydrothermal vent loaded");
    // gui.add(ventModel.rotation, "x", -100, 100, 0.001).name("ventXRot");
    // gui.add(ventModel.rotation, "y", -100, 100, 0.001).name("ventYRot");
    // gui.add(ventModel.rotation, "z", -100, 100, 0.001).name("ventZRot");
    // gui.add(ventModel.position, "x", -100, 100, 0.001).name("ventX");
    // gui.add(ventModel.position, "y", -100, 100, 0.001).name("ventY");
    // gui.add(ventModel.position, "z", -100, 100, 0.001).name("ventZ");
  }
});

//End 3d load

//Sunset gradient Lights
const directionalLight = new THREE.DirectionalLight(0xffeec66, 10);
scene.add(directionalLight);

const ventDirectionalLight = new THREE.DirectionalLight(0x011a30, 100);
scene.add(ventDirectionalLight);
ventDirectionalLight.layers.set(3);

const ventDirectionalLight2 = new THREE.DirectionalLight(0x017598, 5);
scene.add(ventDirectionalLight2);
ventDirectionalLight2.layers.set(3);

/**
 * Composer
 */
const composer = new EffectComposer(renderer);
//const particlesComposer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));

/**
 * Passes
 */

const bokehPass = new BokehPass(scene, camera, {
  focus: 10.902,
  aperture: 10.9025,
  maxblur: 0.3854,

  width: window.innerWidth,
  height: window.innerHeight,
});
composer.addPass(bokehPass);
//particlesComposer.addPass(bokehPass);

// gui.add(bokehPass.uniforms.maxblur, "value", -1.0, 1.0, 0.00001).name("blur");
// gui
//   .add(bokehPass.uniforms.aperture, "value", -1.0, 10.0, 0.00001)
//   .name("aperture");
// gui.add(bokehPass.uniforms.focus, "value", -1.0, 3000.0, 0.00001).name("focus");

camera.position.set(0, 0, 5.9);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

/**
 * More lights
 */

const light = new THREE.AmbientLight(0xffffff); // soft white light
light.intensity = 10;
scene.add(light);

const lightLayer1 = new THREE.AmbientLight(0xffffff); // soft white light
lightLayer1.intensity = 1;
scene.add(lightLayer1);
lightLayer1.layers.set(3);

/**
 * Sky for reflection
 */

const planeGeometrySky = new THREE.PlaneGeometry(600, 600);
const planeMaterialSky = new THREE.ShaderMaterial({
  vertexShader: vertexShaderGrad,
  fragmentShader: fragmentShaderGrad,
});
const planeSky = new THREE.Mesh(planeGeometrySky, planeMaterialSky);
planeMaterialSky.uniforms.u_resolution = {
  value: new THREE.Vector2(window.innerWidth, window.innerHeight),
};
planeMaterialSky.uniforms.red = { value: -1.0 }; //0.267 //0.894
planeMaterialSky.uniforms.green = { value: 1.373 }; //1.373
planeMaterialSky.uniforms.blue = { value: 1.484 }; //1.52 //1.594
//console.log(planeMaterialSky.uniforms.red.value);

// gui.add(planeMaterialSky.uniforms.red, "value", -1, 2, 0.001);
// gui.add(planeMaterialSky.uniforms.green, "value", -1, 2, 0.001);
// gui.add(planeMaterialSky.uniforms.blue, "value", -1, 2, 0.001);

//planeSky.rotation.x = -Math.PI * 0.5;
planeSky.position.y = 10;
planeSky.rotation.y = 0;
scene.add(planeSky);

const upSphereGeometry = new THREE.TorusGeometry(12.9, 12.2, 4);
const upSphereMaterial = new THREE.MeshStandardMaterial({
  color: 0xfbf6e2,
  transparent: true,
  opacity: 0.25,
}); //yellow 0xffedaba
const upSphere = new THREE.Mesh(upSphereGeometry, upSphereMaterial);
upSphere.position.y = -8.35;
upSphere.position.z = -6.3;
upSphere.position.x = -5;
upSphere.rotation.x = 20;
scene.add(upSphere);

// gui.add(upSphere.position, "y", -30, 30, 0.01);

const sphereGeometry = new THREE.TorusGeometry(10.9, 8, 4);
const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xffaaaa }); //pink 0xffaaaa
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
sphere.position.x = 0;
sphere.position.y = -3.92;
sphere.position.z = -8.3466;
sphere.position.x = 0;
sphere.rotation.x = 20;
scene.add(sphere);

// gui.add(sphere.position, "x", -30.0, 30.0, 0.00001).name("posx");
// gui.add(sphere.position, "y", -30.0, 30.0, 0.00001).name("posy");
// gui.add(sphere.position, "z", -30.0, 30.0, 0.00001).name("posz");

/**
 * Particles
 */

const textureLoader = new THREE.TextureLoader();

//
/**
 * Smoke
 */
//Geometry
/**
 * Smoke
 */
// Geometry
const smokeGeometry = new THREE.SphereGeometry(-2, 32, 64);
//smokeGeometry.translate(0, 0.5, 0);
smokeGeometry.scale(0.85, 1, 0.8);

// Perlin texture
const perlinTexture = textureLoader.load("water.jpg");
perlinTexture.wrapS = THREE.RepeatWrapping;
perlinTexture.wrapT = THREE.RepeatWrapping;

// Material
const smokeMaterial = new THREE.ShaderMaterial({
  vertexShader: heatFadedSmokeVertexShader,
  fragmentShader: heatFadedSmokeFragmentShader,
  uniforms: {
    uTime: new THREE.Uniform(0),
    uPerlinTexture: new THREE.Uniform(perlinTexture),
  },
  side: THREE.DoubleSide,
  transparent: true,
  depthWrite: false,
  // wireframe: true
});

// Mesh
const smoke = new THREE.Mesh(smokeGeometry, smokeMaterial);
smoke.position.x = -1.56;
smoke.position.y = -2.12;
smoke.position.z = 0.99;

smoke.rotation.x = 3;
smoke.rotation.y = 0.07;
smoke.rotation.z = -0.44;

scene.add(smoke);
smoke.layers.set(3);

// gui.add(smoke.position, "x", -100, 100, 0.01).name("smokeX");
// gui.add(smoke.position, "y", -100, 100, 0.01).name("smokeY");
// gui.add(smoke.position, "z", -100, 100, 0.01).name("smokeZ");
// gui.add(smoke.rotation, "x", -100, 100, 0.01).name("smokeXRot");
// gui.add(smoke.rotation, "y", -100, 100, 0.01).name("smokeYRot");
// gui.add(smoke.rotation, "z", -100, 100, 0.01).name("smokeZRot");
//

const particleTexture = textureLoader.load("waterDust.png");

const particlesGeometry = new THREE.BufferGeometry();
const glowParticlesGeometry = new THREE.BufferGeometry();
const count = 1000;
const count2 = 100;
const positions = new Float32Array(count * 3); // Multiply by 3 because each position is composed of 3 values (x, y, z)
const glowPositions = new Float32Array(count * 3);
const colors = new Float32Array(count * 3);

for (let i = 0; i < count * 3; i++) {
  positions[i] = (Math.random() - 0.5) * 45; // Math.random() - 0.5 to have a random value between -0.5 and +0.5
  //glowPositions[i] = (Math.random() - 0.5) * 35; // Math.random() - 0.5 to have a random value between -0.5 and +0.5
  colors[i] = Math.random();
}

for (let j = 0; j < count2 * 2; j++) {
  glowPositions[j] = (Math.random() - 0.5) * 3305; // Math.random() - 0.5 to have a random value between -0.5 and +0.5
}
particlesGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(positions, 3)
);

glowParticlesGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(glowPositions, 3)
); // Create the Three.js

particlesGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
glowParticlesGeometry.setAttribute(
  "color",
  new THREE.BufferAttribute(colors, 3)
);

const particlesMaterial = new THREE.PointsMaterial({
  size: 0.017,
  sizeAttenuation: true,
  blending: THREE.AdditiveBlending,
  transparent: true,
  opacity: 0.19, //0.17,
  fog: true,
  map: particleTexture,
  vertexColors: true,
});

const glowParticlesMaterial = new THREE.PointsMaterial({
  size: 2.3,
  sizeAttenuation: false,
  blending: THREE.AdditiveBlending,
  transparent: true,
  opacity: 0.87, //0.17,
  map: particleTexture,
  fog: true,
  vertexColors: true,
});

//particlesMaterial.vertexColors = true;
//particlesMaterial.map = particleTexture;
const particles = new THREE.Points(particlesGeometry, particlesMaterial);
const glowParticles = new THREE.Points(
  glowParticlesGeometry,
  glowParticlesMaterial
);

const particles2 = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particles2);
particles2.position.z = 18; //not animated

particles2.position.x = 0;
particles2.position.x = -2.531;
particles2.position.y = -0.178;
particles2.position.z = 0.117;

particles2.layers.set(3);
particles.position.y = 10;
particles.position.x = -10;
//particles.position.z = 10;
//glowParticles.position.y = -100;
scene.add(particles);
scene.add(glowParticles);
particles.layers.set(3);
glowParticles.layers.set(3);

/**
 * Texture
 */

const mirrorShader = Reflector.ReflectorShader;
mirrorShader.vertexShader = vertexShader;
mirrorShader.fragmentShader = fragmentShader;

const dudvMap = new THREE.TextureLoader().load("waterdudv.jpg", function () {
  animate();
});
dudvMap.colorSpace = THREE.SRGBColorSpace;
dudvMap.anisotropy = maxAnisotropy;

mirrorShader.uniforms.tDudv = { value: dudvMap };
mirrorShader.uniforms.time = { value: 0 };

dudvMap.wrapS = dudvMap.wrapT = THREE.RepeatWrapping;

let geometry, groundMirror, material, mirrorOptions;

const planeGeometry2 = new THREE.PlaneGeometry(2500, 2500);
mirrorOptions = {
  shader: mirrorShader,
  clipBias: 0.005,
  textureWidth: window.innerWidth,
  textureHeight: window.innerHeight,
  color: 0x5abae0,
  //textureWidth: window.innerWidth * window.devicePixelRatio,
  //textureHeight: window.innerHeight * window.devicePixelRatio,
};

groundMirror = new Reflector(planeGeometry2, mirrorOptions);
//groundMirror.position.y = -2;
//groundMirror.rotation.x = -Math.PI * 0.5;
scene.add(groundMirror);
//groundMirror.rotation.y = -20;
// groundMirror.position.y = 42;
// groundMirror.position.z = -220;
groundMirror.position.x = -10;
groundMirror.position.y = 9;
groundMirror.rotation.x = -1.5;
groundMirror.rotation.y = -3.01;

const clock = new THREE.Clock();
/**
 * Fish
 */

/* TEXTURE WIDTH FOR SIMULATION */
const WIDTH = 85;

const FISHIES = WIDTH * WIDTH;

// Custom Geometry - using 3 triangles each. No UVs, no normals currently.
class BirdGeometry extends THREE.BufferGeometry {
  constructor() {
    super();

    const trianglesPerBird = 3;
    const triangles = FISHIES * trianglesPerBird;
    const points = triangles * 3;

    const vertices = new THREE.BufferAttribute(new Float32Array(points * 3), 3);

    const fishColors = new THREE.BufferAttribute(
      new Float32Array(points * 3),
      3
    );
    const references = new THREE.BufferAttribute(
      new Float32Array(points * 2),
      2
    );
    const fishVertex = new THREE.BufferAttribute(new Float32Array(points), 1);

    this.setAttribute("position", vertices);
    this.setAttribute("fishColor", fishColors);
    this.setAttribute("reference", references);
    this.setAttribute("fishVertex", fishVertex);

    // this.setAttribute( 'normal', new Float32Array( points * 3 ), 3 );

    let v = 0;

    function verts_push() {
      for (let i = 0; i < arguments.length; i++) {
        vertices.array[v++] = arguments[i];
      }
    }

    for (let f = 0; f < FISHIES; f++) {
      // Body

      verts_push(0, -0, -20, 0, 15, -90, 0, 0, -80);

      // Wings

      verts_push(0, 0, -55, 0, -10, 0, 0, 0, 25);

      verts_push(0, 0, 25, 0, 10, 0, 0, 0, -55);
    }

    for (let v = 0; v < triangles * 3; v++) {
      const triangleIndex = ~~(v / 3);
      const fishIndex = ~~(triangleIndex / trianglesPerBird);
      const x = (fishIndex % WIDTH) / WIDTH;
      const y = ~~(fishIndex / WIDTH) / WIDTH;

      const c = new THREE.Color(0xff0000 + (~~(v / 9) / FISHIES) * 0xff0000);

      fishColors.array[v * 3 + 0] = c.r;
      fishColors.array[v * 3 + 1] = c.g;
      fishColors.array[v * 3 + 2] = c.b;

      references.array[v * 2] = x;
      references.array[v * 2 + 1] = y;

      fishVertex.array[v] = v % 3;
    }

    this.scale(0.03, 0.03, 0.03);
  }
}

let gpuCompute;
let velocityVariable;
let positionVariable;
let positionUniforms;
let velocityUniforms;
let fishUniforms;

function initComputeRenderer() {
  gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);

  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  fillPositionTexture(dtPosition);
  fillVelocityTexture(dtVelocity);

  velocityVariable = gpuCompute.addVariable(
    "textureVelocity",
    fragmentShaderVelocity,
    dtVelocity
  );

  positionVariable = gpuCompute.addVariable(
    "texturePosition",
    fragmentShaderPosition,
    dtPosition
  );

  gpuCompute.setVariableDependencies(velocityVariable, [
    positionVariable,
    velocityVariable,
  ]);
  gpuCompute.setVariableDependencies(positionVariable, [
    positionVariable,
    velocityVariable,
  ]);

  positionUniforms = positionVariable.material.uniforms;
  velocityUniforms = velocityVariable.material.uniforms;

  positionUniforms["time"] = { value: 0.0 };
  positionUniforms["delta"] = { value: 0.0 };
  velocityUniforms["time"] = { value: 1.0 };
  velocityUniforms["delta"] = { value: 0.0 };
  velocityUniforms["testing"] = { value: 1.0 };
  velocityUniforms["separationDistance"] = { value: 8.0 };
  velocityUniforms["alignmentDistance"] = { value: 0.0 };
  velocityUniforms["cohesionDistance"] = { value: 90.0 };
  velocityUniforms["freedomFactor"] = { value: 1.0 };
  velocityUniforms["predator"] = { value: new THREE.Vector3() };
  velocityVariable.material.defines.BOUNDS = BOUNDS.toFixed(2);

  velocityVariable.wrapS = THREE.RepeatWrapping;
  velocityVariable.wrapT = THREE.RepeatWrapping;
  positionVariable.wrapS = THREE.RepeatWrapping;
  positionVariable.wrapT = THREE.RepeatWrapping;

  const error = gpuCompute.init();

  if (error !== null) {
    console.error(error);
  }
}

function initBirds() {
  const geometry = new BirdGeometry();

  // For Vertex and Fragment
  fishUniforms = {
    color: { value: new THREE.Color(0xff2200) },
    texturePosition: { value: null },
    textureVelocity: { value: null },
    time: { value: 1.0 },
    delta: { value: 0.0 },
  };

  // THREE.ShaderMaterial
  const material = new THREE.ShaderMaterial({
    uniforms: fishUniforms,
    vertexShader: vertexShaderFish,
    fragmentShader: fragmentShaderFish,
    side: THREE.DoubleSide,
  });

  const fishMesh = new THREE.Mesh(geometry, material);
  fishMesh.rotation.y = Math.PI / 2;
  fishMesh.position.z = -1000;
  fishMesh.matrixAutoUpdate = false;
  fishMesh.updateMatrix();

  fishMesh.layers.set(3);
  scene.add(fishMesh);
}

function fillPositionTexture(texture) {
  const theArray = texture.image.data;

  for (let k = 0, kl = theArray.length; k < kl; k += 4) {
    const x = Math.random() * 100 - 5;
    //const x = 100;
    // const y = Math.random() * BOUNDS - BOUNDS_HALF;
    // const z = Math.random() * BOUNDS - BOUNDS_HALF;

    theArray[k + 0] = x;
    // theArray[k + 1] = y;
    // theArray[k + 2] = z;
    // theArray[k + 3] = 1;
  }
}
function fillVelocityTexture(texture) {
  const theArray = texture.image.data;

  for (let k = 0, kl = theArray.length; k < kl; k += 4) {
    const x = Math.random() - 0.5;
    const y = Math.random() - 0.5;
    const z = Math.random() - 0.5;

    theArray[k + 0] = x * 0.04;
    theArray[k + 1] = y * 0.08;
    theArray[k + 2] = z * 0.01;
    // theArray[k + 3] = 1;
  }
}

function onPointerMove(event) {
  if (event.isPrimary === false) return;

  mouseX = event.clientX - windowHalfX;
  mouseY = event.clientY - windowHalfY;
}

initComputeRenderer();
initBirds();

/**
 * Vent Smoke
 */

// Texture smoke

const size = 96;
const data = new Uint8Array(size * size * size);

let i = 0;
const scale = 0.08;
const perlin = new ImprovedNoise();
const vector = new THREE.Vector3();

for (let z = 0; z < size; z++) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d =
        1.0 -
        vector
          .set(x, y, z)
          .subScalar(size / 2)
          .divideScalar(size)
          .length();
      data[i] =
        (128 +
          128 * perlin.noise((x * scale) / 1.5, y * scale, (z * scale) / 1.5)) *
        d *
        d;
      i++;
    }
  }
}

const texture = new THREE.Data3DTexture(data, size, size, size);
texture.format = THREE.RedFormat;
texture.minFilter = THREE.LinearFilter;
texture.magFilter = THREE.LinearFilter;
texture.unpackAlignment = 1;
texture.needsUpdate = true;
const ventSmokeGeometry = new THREE.SphereGeometry(1, 16, 4);
async function loadShader(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network response was not ok.");
    return await response.text();
  } catch (error) {
    console.error("Failed to load shader:", error);
    return null;
  }
}
let ventSmoke, ventSmokeMaterial;
// Function to initialize and add the vent smoke to the scene

ventSmokeMaterial = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms: {
    base: { value: new THREE.Color(0x798aa0) },
    map: { value: texture },
    // cameraPos: { value: new THREE.Vector3() },
    smokeLength: { value: new THREE.Vector3(0.1, 1.0, 0.07) },
    threshold: { value: 0.28 },
    opacity: { value: 0.09 },
    range: { value: 0.1 },
    steps: { value: 20 },
    frame: { value: 0 },
    uTime: new THREE.Uniform(0),
  },
  vertexShader: vertexShaderVentSmoke,
  fragmentShader: fragmentShaderVentSmoke,
  transparent: true,
});

ventSmoke = new THREE.Mesh(ventSmokeGeometry, ventSmokeMaterial);
scene.add(ventSmoke);
ventSmoke.layers.set(3);
ventSmoke.position.x = -1.6; //-1.7;
ventSmoke.position.y = -4.8; //-5.4;
ventSmoke.position.z = -1; //-0.8;
ventSmoke.rotation.x = 15.8; //15.7;
ventSmoke.rotation.y = 16.4; //14.6;
ventSmoke.rotation.z = 1.7; //1.9;
//gui.add(ventSmoke.position, "x", -100, 100, 0.1).name("ventSmokeX");
//gui.add(ventSmoke.position, "y", -100, 100, 0.1).name("ventSmokeY");
//gui.add(ventSmoke.position, "z", -100, 100, 0.1).name("ventSmokeZ");
//gui.add(ventSmoke.rotation, "x", -100, 100, 0.1).name("ventSmokeXRot");
//gui.add(ventSmoke.rotation, "y", -100, 100, 0.1).name("ventSmokeYRot");
//gui.add(ventSmoke.rotation, "z", -100, 100, 0.1).name("ventSmokeZRot");

console.log("d" + ventSmoke);

const parameters = {
  threshold: 0.32,
  opacity: 0.15,
  range: 0.1,
  steps: 0,
};

function update() {
  ventSmokeMaterial.uniforms.threshold.value = parameters.threshold;
  ventSmokeMaterial.uniforms.opacity.value = parameters.opacity;
  ventSmokeMaterial.uniforms.range.value = parameters.range;
  ventSmokeMaterial.uniforms.steps.value = parameters.steps;
  ventSmokeMaterial.uniforms.uTime.value = parameters.uTime;
}

// gui.add(parameters, "threshold", 0, 1, 0.01).onChange(update);
// gui.add(parameters, "opacity", 0, 1, 0.01).onChange(update);
// gui.add(parameters, "range", 0, 1, 0.01).onChange(update);
// gui.add(parameters, "steps", 0, 2000, 10).onChange(update);

/**
 * End vent smoke
 */

/**
 * Animate
 */

renderer.autoClear = false;

let duration = 3000; // Duration in milliseconds
let startTime = Date.now(); // Start time

function animate() {
  const timer = 0.0001 * Date.now();
  requestAnimationFrame(animate);

  // for (let i = 0, il = spheres.length; i < il; i++) {
  //   const sphere = spheres[i];

  //   sphere.position.x = 5000 * Math.cos(timer + i);
  //   sphere.position.y = 8000 * Math.sin(timer + i * 1.1);
  //   sphere.position.z = -5000 * Math.sin(timer + i * 1.1);
  //   sphere.layers.set(2);
  // }

  // for (let i = 0, il = spheres.length; i < il; i++) {
  //   const sphere = spheres[i];
  //   sphere.position.x = 4000 * Math.cos(timer + i * -10);
  //   sphere.position.y = 10000 * Math.sin(timer + i * 81.1);
  //   sphere.layers.set(2);
  // }

  // if (ventSmoke) {
  //   ventSmoke.rotation.y += 0.01;
  //   ventSmoke.rotation.y += 0.01;
  //   ventSmoke.range += 1;
  // }

  //updateControlsBasedOnLayer();
  // Clear the previous frame
  renderer.clear();
  // Render Layer 0 (e.g., main scene objects)
  camera.layers.set(0);
  controls.enabled = false;
  composer.render(); // Assuming composer is set up for layer 0 effects
  //console.log(ventSmoke);

  // Clear only the depth buffer to allow layer 1 to render without depth conflicts
  renderer.clearDepth();

  const now = performance.now();

  let delta = (now - last) / 3000;
  //console.log(delta);

  if (delta > 1) delta = 1; // safety cap on large deltas
  last = now;

  positionUniforms["time"].value = now;
  positionUniforms["delta"].value = delta;
  velocityUniforms["time"].value = now;
  velocityUniforms["delta"].value = delta * 0.5;
  fishUniforms["time"].value = now;
  fishUniforms["delta"].value = delta;

  velocityUniforms["predator"].value.set(
    (0.5 * mouseX) / windowHalfX,
    (-0.5 * mouseY) / windowHalfY,
    0
  );

  mouseX = 10000;
  mouseY = 10000;

  gpuCompute.compute();

  fishUniforms["texturePosition"].value =
    gpuCompute.getCurrentRenderTarget(positionVariable).texture;
  fishUniforms["textureVelocity"].value =
    gpuCompute.getCurrentRenderTarget(velocityVariable).texture;

  if (ventSmokeMaterial) {
    ventSmokeMaterial.uniforms.uTime.value -= 0.1; // Increment or update time
    ventSmoke.rotation.y -= 0.001;
    // ventSmokeMaterial.uniforms.opacity.value = Math.sin(0.002);
    //console.log("opac", ventSmokeMaterial.uniforms.opacity.value);

    //console.log("utime");
  }

  // Update time-dependent transformations
  const elapsedTime = clock.getElapsedTime();
  updateParticlePositions(elapsedTime); // A new function to handle particle updates
  smokeMaterial.uniforms.uTime.value = elapsedTime * 2;
  // Render Layer 1 (e.g., particles)
  camera.layers.set(1);
  renderer.render(scene, ventCamera);
  //particlesCamera.layers.set(2);
  ventCamera.layers.set(3);
  particlesCamera.layers.set(2);

  renderer.render(scene, camera); // Using renderer directly if no post-processing is needed for layer 1

  // Update any other dynamic elements
  updateDynamicElements(elapsedTime); // Handles other time-based updates
}

function updateParticlePositions(elapsedTime) {
  particles.rotation.y = elapsedTime * -0.03;
  particles2.rotation.y = elapsedTime * -0.03;
  glowParticles.rotation.y = elapsedTime * -0.03;
  glowParticles.rotation.z = elapsedTime * -0.03;
  glowParticles.position.y = elapsedTime * -0.03;
}

function updateDynamicElements(elapsedTime) {
  mirrorShader.uniforms.time.value += 0.503;
  groundMirror.material.uniforms.time.value += 0.0503;
}

// let sine;
// for (let i = 0; i < 0.2; i -= 0.01) {
//   sine = Math.sin(i);
//   // console.log("sine ", sine);
// }

animate();
