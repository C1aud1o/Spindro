import json,struct,sys,io
from PIL import Image
src,dst=sys.argv[1],sys.argv[2]
b=open(src,'rb').read()
jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl]); o=20+jl
bl=struct.unpack('<I',b[o:o+4])[0]; bin_=b[o+8:o+8+bl]
views=j['bufferViews']; newdata={}
for img in j.get('images',[]):
    v=views[img['bufferView']]; raw=bin_[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
    im=Image.open(io.BytesIO(raw)).convert('RGB'); im=im.resize((1024,1024),Image.LANCZOS)
    buf=io.BytesIO(); im.save(buf,'JPEG',quality=88,optimize=True); newdata[img['bufferView']]=buf.getvalue(); img['mimeType']='image/jpeg'
out=bytearray()
for i,v in enumerate(views):
    data=newdata.get(i, bin_[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])
    while len(out)%4: out.append(0)
    v['byteOffset']=len(out); v['byteLength']=len(data); out+=data
while len(out)%4: out.append(0)
j['buffers'][0]['byteLength']=len(out)
js=json.dumps(j,separators=(',',':')).encode()
while len(js)%4: js+=b' '
glb=struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(out))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(out),0x004E4942)+bytes(out)
open(dst,'wb').write(glb); print(len(b)//1024,'KB ->',len(glb)//1024,'KB')
