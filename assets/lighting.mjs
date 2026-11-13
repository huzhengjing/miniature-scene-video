import * as THREE from 'three';

// One world-space lighting rig shared by every camera pose.
export function createLighting(scene){
  const direction=new THREE.Vector3(-20,11,30).normalize();
  const origin=new THREE.Vector3(0,0,0);
  const solarDistance=170;
  const solarRadius=6.5;
  const position=direction.clone().multiplyScalar(solarDistance);
  const ambient=new THREE.Group();
  ambient.name='global-ambient-fill';
  ambient.add(new THREE.AmbientLight('#C1CCD9',1.8));
  ambient.add(new THREE.HemisphereLight('#FFF1DA','#ADB8CA',.18));
  scene.add(ambient);
  const light=new THREE.DirectionalLight('#FFD1A1',2.5);
  light.name='world-locked-sun';
  light.position.copy(position);light.target.position.copy(origin);
  light.castShadow=true;light.shadow.mapSize.set(1024,1024);
  Object.assign(light.shadow.camera,{left:-29,right:29,top:29,bottom:-29,near:110,far:230});
  light.shadow.bias=-.00015;light.shadow.normalBias=.025;
  scene.add(light,light.target);
  // An unlit sphere presents a circular solar disc from any viewing direction.
  // Its geometry, position, size and orientation have no camera dependency.
  const disc=new THREE.Mesh(new THREE.SphereGeometry(solarRadius,64,32),new THREE.MeshBasicMaterial({color:'#FFE3AA'}));
  disc.name='world-space-solar-disc';disc.position.copy(position);
  disc.castShadow=false;disc.receiveShadow=false;disc.userData.noMerge=true;
  scene.add(disc);
  for(const object of [light,light.target,disc]){object.updateMatrix();object.matrixAutoUpdate=false;}
  return {ambient,light,disc,direction,position,solarRadius};
}

