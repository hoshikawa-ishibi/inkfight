// glTF 2.0 二进制导出：保留节点关节与 PBR 材质，不序列化运行时 userData 引用。
// 适用于本项目的无贴图、单材质三角网格；导出静止姿态，动作由游戏驱动。
export function exportModelGlb(root){
  const gltf={asset:{version:'2.0',generator:'Inkfight procedural model workshop'},scene:0,
    scenes:[{nodes:[0]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[]};
  const chunks=[],materials=new Map();let byteLength=0;
  const align=n=>(n+3)&~3;
  function accessor(attribute,target,isPosition=false){
    const array=attribute.array;
    const componentType=array instanceof Float32Array?5126:array instanceof Uint32Array?5125:array instanceof Uint16Array?5123:0;
    if(!componentType||attribute.isInterleavedBufferAttribute)throw new Error('Unsupported model attribute');
    const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
    const view=gltf.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.length,target})-1;
    chunks.push({at:byteLength,bytes});byteLength+=align(bytes.length);
    const a={bufferView:view,componentType,count:attribute.count,type:['','SCALAR','VEC2','VEC3','VEC4'][attribute.itemSize]};
    if(isPosition){
      a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<array.length;i++){const axis=i%3;a.min[axis]=Math.min(a.min[axis],array[i]);a.max[axis]=Math.max(a.max[axis],array[i]);}
    }
    return gltf.accessors.push(a)-1;
  }
  function material(m){
    if(materials.has(m))return materials.get(m);
    if(Array.isArray(m)||m.map)throw new Error('This exporter accepts untextured single-material meshes');
    const c=m.color,em=m.emissive;
    const value={name:m.name||'Inkfight material',doubleSided:m.side===2,
      pbrMetallicRoughness:{baseColorFactor:[c.r,c.g,c.b,m.opacity??1],metallicFactor:m.metalness??0,roughnessFactor:m.roughness??1}};
    if(em)value.emissiveFactor=[em.r,em.g,em.b].map(n=>Math.min(1,n*(m.emissiveIntensity??1)));
    if(m.transparent)value.alphaMode='BLEND';
    const id=gltf.materials.push(value)-1;materials.set(m,id);return id;
  }
  function node(object){
    object.updateMatrix();
    const data={name:object.name||object.type,matrix:object.matrix.toArray()};
    const id=gltf.nodes.push(data)-1;
    if(object.isMesh){
      const geometry=object.geometry,attributes={};
      for(const [name,semantic] of [['position','POSITION'],['normal','NORMAL']]){
        if(geometry.attributes[name])attributes[semantic]=accessor(geometry.attributes[name],34962,name==='position');
      }
      const primitive={attributes,material:material(object.material),mode:4};
      if(geometry.index)primitive.indices=accessor(geometry.index,34963);
      data.mesh=gltf.meshes.push({name:object.name||'mesh',primitives:[primitive]})-1;
    }
    const children=object.children.filter(o=>o.visible&&!o.isLight&&!o.isCamera&&!o.isPoints);
    if(children.length)data.children=children.map(node);
    return id;
  }
  node(root);gltf.buffers.push({byteLength});
  const json=new TextEncoder().encode(JSON.stringify(gltf)),jsonLength=align(json.length);
  const total=12+8+jsonLength+8+byteLength,raw=new ArrayBuffer(total),view=new DataView(raw),bytes=new Uint8Array(raw);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,total,true);
  view.setUint32(12,jsonLength,true);view.setUint32(16,0x4e4f534a,true);
  bytes.fill(32,20,20+jsonLength);bytes.set(json,20);
  const binaryAt=20+jsonLength;view.setUint32(binaryAt,byteLength,true);view.setUint32(binaryAt+4,0x004e4942,true);
  for(const chunk of chunks)bytes.set(chunk.bytes,binaryAt+8+chunk.at);
  return raw;
}
