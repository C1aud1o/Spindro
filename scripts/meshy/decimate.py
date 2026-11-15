# Semplificazione per raggruppamento di vertici (vertex clustering) di un GLB con una sola primitiva e texture.
# uso: decimate.py in.glb out.glb CELLE_IN_ALTEZZA [lato_texture] [celle_uv]  (meno celle_uv = meno vertici ma texture meno precisa; default 24)
import json,struct,sys,io
import numpy as np
from PIL import Image
src,dst,cells=sys.argv[1],sys.argv[2],int(sys.argv[3]); tex=int(sys.argv[4]) if len(sys.argv)>4 else 1024; UVC=int(sys.argv[5]) if len(sys.argv)>5 else 24
b=open(src,'rb').read(); jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl]); o=20+jl
bl=struct.unpack('<I',b[o:o+4])[0]; BIN=b[o+8:o+8+bl]
CT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}; NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def acc(i):
    a=j['accessors'][i]; v=j['bufferViews'][a['bufferView']]; dt=np.dtype(CT[a['componentType']]); n=NC[a['type']]
    off=v.get('byteOffset',0)+a.get('byteOffset',0); stride=v.get('byteStride',0) or dt.itemsize*n
    raw=np.frombuffer(BIN,dtype=np.uint8,count=a['count']*stride,offset=off).reshape(a['count'],stride)[:,:dt.itemsize*n]
    arr=raw.copy().view(dt).reshape(a['count'],n)
    if a.get('normalized'): arr=arr.astype(np.float32)/np.iinfo(dt).max
    return arr
prim=j['meshes'][0]['primitives'][0]
P=acc(prim['attributes']['POSITION']).astype(np.float64); UV=acc(prim['attributes']['TEXCOORD_0']).astype(np.float64)
I=acc(prim['indices']).reshape(-1,3) if 'indices' in prim else np.arange(len(P)).reshape(-1,3)
# applica la trasformazione del nodo, se c'è
node=next(n for n in j['nodes'] if n.get('mesh')==0)
if 'matrix' in node: M=np.array(node['matrix']).reshape(4,4).T; P=(np.c_[P,np.ones(len(P))]@M.T)[:,:3]
else:
    if 'scale' in node: P=P*np.array(node['scale'])
    if 'rotation' in node:
        x,y,z,w=node['rotation']; R=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]); P=P@R.T
    if 'translation' in node: P=P+np.array(node['translation'])
lo=P.min(0); H=P[:,1].max()-lo[1]; cs=H/cells
key=np.floor((P-lo)/cs).astype(np.int64); uvk=np.floor(UV*UVC).astype(np.int64)  # le isole della texture restano separate
K=np.c_[key,uvk]; uniq,inv=np.unique(K,axis=0,return_inverse=True); inv=inv.ravel()
cnt=np.bincount(inv); NUV=np.zeros((len(uniq),2))
for c in range(2): NUV[:,c]=np.bincount(inv,UV[:,c])/cnt
# posizione: media su tutta la cella (tutte le isole), così le cuciture restano chiuse
_,pinv=np.unique(key,axis=0,return_inverse=True); pinv=pinv.ravel(); pc=np.bincount(pinv); CP=np.zeros((pc.size,3))
for c in range(3): CP[:,c]=np.bincount(pinv,P[:,c])/pc
vcell=np.zeros(len(uniq),dtype=np.int64); vcell[inv]=pinv; NP=CP[vcell]
T=inv[I]; ok=(T[:,0]!=T[:,1])&(T[:,1]!=T[:,2])&(T[:,0]!=T[:,2]); T=T[ok]
T=np.unique(np.sort(T,axis=1)*0+T,axis=0) if False else T
# normali morbide
# normali morbide calcolate per cella (stessa normale ai due lati di una cucitura)
fn=np.cross(NP[T[:,1]]-NP[T[:,0]],NP[T[:,2]]-NP[T[:,0]]); NC_=np.zeros((pc.size,3))
for c in range(3): np.add.at(NC_,vcell[T[:,c]],fn)
NC_/=np.maximum(1e-12,np.linalg.norm(NC_,axis=1))[:,None]; N=NC_[vcell]
# texture: solo il colore base, ridotta
mat=j['materials'][prim.get('material',0)]; ti=mat['pbrMetallicRoughness']['baseColorTexture']['index']; img=j['images'][j['textures'][ti]['source']]
v=j['bufferViews'][img['bufferView']]; im=Image.open(io.BytesIO(BIN[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB').resize((tex,tex),Image.LANCZOS)
ib=io.BytesIO(); im.save(ib,'JPEG',quality=88,optimize=True); IMG=ib.getvalue()
# scrittura GLB minimo
parts=[NP.astype(np.float32).tobytes(),N.astype(np.float32).tobytes(),NUV.astype(np.float32).tobytes(),T.astype(np.uint32).tobytes(),IMG]
out=bytearray(); views=[]
for p in parts:
    while len(out)%4: out.append(0)
    views.append({'buffer':0,'byteOffset':len(out),'byteLength':len(p)}); out+=p
while len(out)%4: out.append(0)
nv=len(NP); g={'asset':{'version':'2.0','generator':'spindro decimate'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0}],
 'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1,'TEXCOORD_0':2},'indices':3,'material':0}]}],
 'materials':[{'pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':1}}],
 'textures':[{'source':0}],'images':[{'bufferView':4,'mimeType':'image/jpeg'}],'buffers':[{'byteLength':len(out)}],'bufferViews':views,
 'accessors':[{'bufferView':0,'componentType':5126,'count':nv,'type':'VEC3','min':NP.min(0).tolist(),'max':NP.max(0).tolist()},
  {'bufferView':1,'componentType':5126,'count':nv,'type':'VEC3'},{'bufferView':2,'componentType':5126,'count':nv,'type':'VEC2'},
  {'bufferView':3,'componentType':5125,'count':T.size,'type':'SCALAR'}]}
js=json.dumps(g,separators=(',',':')).encode()
while len(js)%4: js+=b' '
open(dst,'wb').write(struct.pack('<III',0x46546C67,2,28+len(js)+len(out))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(out),0x004E4942)+bytes(out))
print(f'{len(I)} -> {len(T)} triangoli, {len(P)} -> {nv} vertici, {(28+len(js)+len(out))//1024} KB')
