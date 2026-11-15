# uso: tris.py file.glb... -> triangoli e KB
import json,struct,sys,os
for f in sys.argv[1:]:
    b=open(f,'rb').read(); jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl]); t=0
    for m in j['meshes']:
        for p in m['primitives']:
            t+=(j['accessors'][p['indices']]['count'] if 'indices' in p else j['accessors'][p['attributes']['POSITION']]['count'])//3
    print(os.path.basename(f),t,os.path.getsize(f)//1024,'KB')
