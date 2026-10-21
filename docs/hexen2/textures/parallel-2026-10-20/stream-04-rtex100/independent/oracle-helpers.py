"""Unchanged independent scalar oracle functions retained from B8 actual proof. No producer imports."""
import io,math
import numpy as np

def blur(a,s):
 h,w=a.shape;f=np.fft.rfftfreq(w)[None,:]**2+np.fft.fftfreq(h)[:,None]**2
 return np.fft.irfft2(np.fft.rfft2(a)*np.exp(-2*np.pi**2*s**2*f),s=a.shape)

def unit(a):return a/np.std(a) if np.std(a)>1e-6 else a*0

def extreme(a,r,fn):
 result=a.copy()
 for k in range(1,r+1):
  for axis in (0,1):result=fn(result,fn(np.roll(a,k,axis),np.roll(a,-k,axis)))
 return result

def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)

def craft64(rgb,p):
 rgb=rgb.astype(float)/255;k=math.sqrt(rgb.shape[0]*rgb.shape[1])/256
 L=rgb@np.array([.299,.587,.114]);mx=rgb.max(2);mn=rgb.min(2);sat=(mx-mn)/np.maximum(mx,1e-4)
 assert not p.get('flatprint')
 L=L-blur(L,40*k)*.85;g=[blur(L,s*k) for s in (1.2,3.5,9,22,60)]
 bands=[L-g[0],g[0]-g[1],g[1]-g[2],g[2]-g[3]]
 H=sum(w*unit(a) for w,a in zip(p['bands'],bands));H=H+.25*unit(g[3]-g[4])*p['bands'][3]
 r=max(1,int(round(3*k)));groove=extreme(g[0],r,np.maximum)-g[0];top=g[0]-extreme(g[0],r,np.minimum)
 H=H-p['groove']*1.5*unit(groove)+p['bump']*1.0*unit(top);H=np.tanh(unit(H)*.9)
 if p['glow']>0:
  glowing=smooth(.55,.85,mx)*smooth(.30,.60,sat);white=smooth(.80,.95,mn)
  m=blur(np.maximum(glowing,white),1.4*k)*p['glow'];floor=np.percentile(H,25)-.35
  H=H*(1-m)+floor*m
 return (H-H.min())/(H.max()-H.min()+1e-6)

def encoded_png(im):
 s=io.BytesIO();im.save(s,'PNG');return s.getvalue()

def encoded_npy(a):
 s=io.BytesIO();np.save(s,a,allow_pickle=False);return s.getvalue()
