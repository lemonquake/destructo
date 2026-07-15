import * as THREE from 'three';

export function resolveRespawnPosition(world,teamId,index=0){
  const authored=world.deploymentPosition?.(teamId,index,.72);
  if(authored)return authored;
  const base=world.basePositions[teamId],pad=world.spawnPositions?.[teamId]||world.builderPositions[teamId]||base;
  const inward=base.clone().multiplyScalar(-1).setY(0).normalize(),side=new THREE.Vector3(-inward.z,0,inward.x);
  const position=pad.clone().addScaledVector(inward,3).addScaledVector(side,((index%3)-1)*2.4).addScaledVector(inward,Math.floor(index/3)*2.4);
  position.y=world.groundAt(position);
  return position;
}
