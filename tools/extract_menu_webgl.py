#!/usr/bin/env python3
"""Reproduce the reviewed donor menu as ESM plus exact source notices.

Only module bindings and host-controlled frame/lifecycle seams are adapted.
The signed-distance atlas, metrics, shaders and layout arithmetic are retained.
"""
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA256 = '0c17c95648f1bcfa20fe2d882814ed11577d2f423cf7682a19535fb889d1f8ce'


def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()


def once(source, old, new):
    if source.count(old) != 1:
        raise ValueError('Donor adaptation anchor changed: ' + old[:100])
    return source.replace(old, new, 1)


def renderer_module(source):
    source = once(source, '(() => {\n', '')
    source = once(source, '  window.QuakeMenu=QuakeMenu;\n})();', '')
    source = once(source, '  class QuakeMenu {', 'export class QuakeMenu {')
    source = source.replace('window.QUAKE_FONT', 'QUAKE_FONT').replace('window.QUAKE_SHADERS', 'QUAKE_SHADERS').replace('window.QuakeFontLoader', 'QuakeFontLoader')
    source = once(source, 'constructor(canvas,{config={},onActivate=null,onSelection=null}={}){',
                  'constructor(canvas,{config={},onActivate=null,onSelection=null,externalFrame=false}={}){')
    source = once(source, "this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,",
                  "this.gl=canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,")
    source = once(source, 'premultipliedAlpha:false,preserveDrawingBuffer:', 'premultipliedAlpha:true,preserveDrawingBuffer:')
    source = once(source, '      this.canvas=canvas;',
                  '      this.canvas=canvas;this.externalFrame=externalFrame===true;')
    source = once(source, 'this.layout=null;this.destroyed=false;this.contextLost=false;',
                  'this.layout=null;this.destroyed=false;this.contextLost=false;this.loaded=false;')
    source = once(source, '      this.handlers=[];this._history=[];',
                  '      this.handlers=[];this._history=[];this._generation=0;this._pendingFontDecodes=new Set();')
    source = once(source, '''      this._makeResources();this._bindInput();
      this.ready=this._uploadFont(this.fontSource).then(()=>{
        this.loaded=true;this._resize();this.render();return this;
      });''', '''      try{this._makeResources();this._bindInput();}catch(error){this.destroy();throw error;}
      const generation=this._generation;
      this.ready=this._uploadFont(this.fontSource,generation).then(uploaded=>{
        if(uploaded&&!this.destroyed&&!this.contextLost&&generation===this._generation){
          this.loaded=true;if(!this.externalFrame){this._resize();this.render();}
        }
        return this;
      });''')
    source = once(source, '''      this.programs={background:makeProgram(gl,S.backgroundVertex,S.backgroundFragment),
        plaque:makeProgram(gl,S.rectVertex,S.plaqueFragment),glyph:makeProgram(gl,S.glyphVertex,S.glyphFragment),
        copy:makeProgram(gl,S.backgroundVertex,S.copyFragment),
        selectorMask:makeProgram(gl,S.backgroundVertex,S.selectorMaskFragment),
        selector:makeProgram(gl,S.selectorVertex,S.selectorFragment)};''', '''      // Assign incrementally so a failed constructor/restoration can dispose
      // every program successfully created before the failing shader.
      this.programs={};
      for(const [name,vertex,fragment] of [
        ['background',S.backgroundVertex,S.backgroundFragment],['plaque',S.rectVertex,S.plaqueFragment],
        ['glyph',S.glyphVertex,S.glyphFragment],['copy',S.backgroundVertex,S.copyFragment],
        ['selectorMask',S.backgroundVertex,S.selectorMaskFragment],['selector',S.selectorVertex,S.selectorFragment]
      ])this.programs[name]=makeProgram(gl,vertex,fragment);''')
    source = once(source, '''    const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
    const program=gl.createProgram(); gl.attachShader(program,vs); gl.attachShader(program,fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);''', '''    const vs=compile(gl.VERTEX_SHADER,vertex);let fs,program;
    try{
      fs=compile(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    }catch(error){if(program)gl.deleteProgram(program);throw error;}
    finally{gl.deleteShader(vs);if(fs)gl.deleteShader(fs);}''')
    source = once(source, '    async _uploadFont(source){\n      const gl=this.gl;', '''    async _uploadFont(source,generation=this._generation){
      const current=()=>!this.destroyed&&!this.contextLost&&generation===this._generation;
      if(!current())return false;
      const gl=this.gl;''')
    source = once(source, '''        const image=new Image(); image.src=source;
        await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('The embedded glyph atlas could not be decoded.'));});
        if(this.destroyed)return;''', '''        const image=new Image();
        await new Promise((resolve,reject)=>{
          let settled=false;
          const finish=error=>{if(settled)return;settled=true;image.onload=image.onerror=null;
            this._pendingFontDecodes.delete(cancel);error?reject(error):resolve();};
          const cancel=()=>finish();this._pendingFontDecodes.add(cancel);
          image.onload=()=>finish();image.onerror=()=>finish(new Error('The embedded glyph atlas could not be decoded.'));
          try{image.src=source;}catch(error){finish(error);}
        });
        if(!current())return false;''')
    source = once(source, '''      this._buildSelectorField();
      this.backgroundDirty=true;this.layoutDirty=true;
    }''', '''      this._buildSelectorField();
      this.backgroundDirty=true;this.layoutDirty=true;
      return true;
    }''')
    source = once(source, '''      const oldFont=this.font,oldSource=this.fontSource;
      try{this.font=result.metrics;this.fontSource=result.data;await this._uploadFont(result.data);}
      catch(error){this.font=oldFont;this.fontSource=oldSource;await this._uploadFont(oldSource);throw error;}
      this.requestRender();return{family:this.font.family,glyphCount:Object.keys(this.font.glyphs).length};
    }
    async resetFont(){this.font=QUAKE_FONT.metrics;this.fontSource=QUAKE_FONT.image;await this._uploadFont(this.fontSource);this.requestRender();}''', '''      const oldFont=this.font,oldSource=this.fontSource,generation=this._generation;
      try{this.font=result.metrics;this.fontSource=result.data;
        if(!await this._uploadFont(result.data,generation))throw new Error('Font upload was interrupted.');}
      catch(error){if(!this.destroyed&&generation===this._generation){this.font=oldFont;this.fontSource=oldSource;await this._uploadFont(oldSource,generation);}throw error;}
      this.requestRender();return{family:this.font.family,glyphCount:Object.keys(this.font.glyphs).length};
    }
    async resetFont(){
      if(this.destroyed)throw new Error('The renderer has been destroyed.');
      this.font=QUAKE_FONT.metrics;this.fontSource=QUAKE_FONT.image;
      if(!await this._uploadFont(this.fontSource))throw new Error('Font upload was interrupted.');
      this.requestRender();
    }''')
    context_start = source.index("      listen(this.canvas,'webglcontextlost'")
    context_end = source.index('      this.observer=new ResizeObserver', context_start)
    source = source[:context_start] + source[context_end:]
    listen_anchor = '      const listen=(target,type,handler,options)=>{target.addEventListener(type,handler,options);this.handlers.push([target,type,handler,options]);};'
    source = once(source, listen_anchor, listen_anchor + '''
      listen(this.canvas,'webglcontextlost',event=>{
        if(this.destroyed)return;event.preventDefault();this.contextLost=true;this.loaded=false;this._generation++;
        for(const cancel of [...this._pendingFontDecodes])cancel();
        cancelAnimationFrame(this.pendingFrame);this.pendingFrame=0;this.lastFrameTime=0;
        this.canvas.dispatchEvent(new CustomEvent('quake:error',{detail:'Graphics context lost. Waiting for restoration…'}));
      });
      listen(this.canvas,'webglcontextrestored',()=>{
        if(this.destroyed)return;
        this.contextLost=false;this.loaded=false;const generation=++this._generation;
        this.nativeLayoutKey=null;this.backgroundDirty=true; // VAO buffers are empty again: rebuild from the host's commands, never the donor layout
        this.ready=(async()=>{
          this._makeResources();const uploaded=await this._uploadFont(this.fontSource,generation);
          if(uploaded&&!this.destroyed&&!this.contextLost&&generation===this._generation){
            this.loaded=true;if(!this.externalFrame)this._resize();this.requestRender();
          }
          return this;
        })();
        // Keep rejection observable through ready while handling the event's
        // otherwise-unobserved promise and reporting failure to the host.
        this.ready.catch(error=>{
          if(this.destroyed||generation!==this._generation)return;
          this.loaded=false;this._deleteResources();
          this.canvas.dispatchEvent(new CustomEvent('quake:error',{detail:error.message}));
        });
      });
      if(this.externalFrame)return;''')
    source = once(source, '      if(this.destroyed||this.exporting||this.contextLost)return;\n      const r=this.canvas.getBoundingClientRect();',
                  '      if(this.externalFrame||this.destroyed||this.exporting||this.contextLost)return;\n      const r=this.canvas.getBoundingClientRect();')
    source = once(source, '      if(this.pendingFrame||this.destroyed||this.contextLost||this.exporting)return;',
                  '      if(this.externalFrame||this.pendingFrame||this.destroyed||this.contextLost||this.exporting)return;')
    advance = '''        if(this._isAnimating()){
          if(this.lastFrameTime)this.selectorRotation=(this.selectorRotation+
            Math.min(.1,(time-this.lastFrameTime)/1000)*this.config.selectorSpeed*Math.PI*2)%(Math.PI*2);
          this.lastFrameTime=time;
        }else this.lastFrameTime=0;'''
    source = once(source, advance, '        this._advanceSelector(time);')
    source = once(source, '    _glyph(char){', '''    _advanceSelector(time){
''' + advance + '''
    }
    // The host supplies physical framebuffer pixels and optional native-menu
    // glyph/panel commands. No CSS/DPR multiplier or event input is introduced.
    frame(width,height,timeMs,commands=null,backgroundOpacity=1){
      if(!this.loaded||this.destroyed||this.contextLost||this.exporting)return false;
      const max=Math.min(8192,this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE));
      if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>max||height>max||width*height>24000000)
        throw new RangeError('Frame dimensions exceed the supported pixel budget.');
      if(!Number.isFinite(timeMs))throw new TypeError('Frame time must be finite milliseconds.');
      if(!Number.isFinite(backgroundOpacity)||backgroundOpacity<0||backgroundOpacity>1)
        throw new RangeError('Background opacity must be in [0,1].');
      if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;this.backgroundDirty=true;}
      if(Array.isArray(commands)){
        const key=JSON.stringify([width,height,commands,backgroundOpacity]);
        if(key!==this.nativeLayoutKey){this._buildNativeLayout(width,height,commands);this.nativeLayoutKey=key;this.backgroundDirty=true;}
        this.backgroundOpacity=backgroundOpacity;this.nativeMode=true;
      }else if(this.nativeMode){this.nativeMode=false;this.nativeLayoutKey=null;this.layoutDirty=true;this.backgroundDirty=true;}
      this._advanceSelector(timeMs);this.render();return true;
    }
    _buildNativeLayout(width,height,commands){
      const panels=[],glyphs=[];
      let selector=null;
      for(const command of commands){
        if(command.type==='panel'){
          panels.push(command.x-8,command.y-8,command.w+16,command.h+16,
            command.vertical||0,command.well?1:0,0,0);
        }else if(command.type==='text'){
          const shape=this._shape(String(command.text),command.size,command.stretch||1,true);
          const ox=command.x-shape.minX,oy=command.y-shape.minY;
          for(const part of shape.parts){const r=part.rect;glyphs.push(r[0]+ox,r[1]+oy,r[2],r[3],...part.uv,
            part.range,command.kind||0,0,0);}
        }else if(command.type==='selector'){
          const q=this._shape('Q',command.size,1.05,false),h=q.height,w=q.width;
          selector={center:[command.x,command.y],height:h,width:w,
            depth:(this.selectorInfo?.spikeWidth||w/Math.max(h,1)*.12)*h};
        }else if(command.type==='slider'){
          panels.push(command.x-8,command.y-10,command.w+16,20,0,1,0,0);
          panels.push(command.x+Math.max(0,Math.min(1,command.value))*(command.w-6)-8,
            command.y-13,22,26,0,0,0,0);
        }
      }
      this.layout={width,height,panels:new Float32Array(panels),glyphs:new Float32Array(glyphs),
        hitboxes:[],emblem:this._fitGlyph('Q',{x:width*.20,y:height*.08,w:width*.60,h:height*.82}),
        selector,titleBounds:null,sideBounds:null};
      const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.plaqueVAO.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.layout.panels,gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.glyphVAO.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.layout.glyphs,gl.DYNAMIC_DRAW);
      this.view=[0,0,1];this.layoutDirty=false;this.backgroundDirty=true;
    }
    _glyph(char){''')
    source = once(source, "      await this.ready;if(this.exporting)throw new Error('An image capture is already running.');", "      await this.ready;if(this.destroyed||this.contextLost||!this.loaded)throw new Error('The renderer is unavailable.');\n      if(this.exporting)throw new Error('An image capture is already running.');\n      const previousSize=[this.canvas.width,this.canvas.height];")
    source = once(source, '      }finally{this.exporting=false;this._resize();this.backgroundDirty=true;this.render();}', '''      }finally{this.exporting=false;
        if(!this.destroyed){if(this.externalFrame){[this.canvas.width,this.canvas.height]=previousSize;}else this._resize();this.backgroundDirty=true;this.render();}
      }''')
    source = once(source, '''    destroy(){
      this.destroyed=true;cancelAnimationFrame(this.pendingFrame);this.observer?.disconnect();
      for(const [target,type,handler,options] of this.handlers)target.removeEventListener(type,handler,options);
      const gl=this.gl;
      for(const p of Object.values(this.programs))gl.deleteProgram(p.program);
      for(const v of [this.backgroundVAO,this.plaqueVAO,this.glyphVAO]){gl.deleteVertexArray(v.array);if(v.buffer)gl.deleteBuffer(v.buffer);}
      gl.deleteBuffer(this.quad);for(const t of [this.fontTexture,this.noiseTexture,this.backgroundTexture,this.selectorTexture])gl.deleteTexture(t);
      gl.deleteFramebuffer(this.backgroundFBO);
    }''', '''    _deleteResources(){
      const gl=this.gl;
      for(const p of Object.values(this.programs||{}))gl.deleteProgram(p.program);
      for(const v of [this.backgroundVAO,this.plaqueVAO,this.glyphVAO])if(v){gl.deleteVertexArray(v.array);if(v.buffer)gl.deleteBuffer(v.buffer);}
      if(this.quad)gl.deleteBuffer(this.quad);
      for(const t of [this.fontTexture,this.noiseTexture,this.backgroundTexture,this.selectorTexture])if(t)gl.deleteTexture(t);
      if(this.backgroundFBO)gl.deleteFramebuffer(this.backgroundFBO);
      this.programs={};this.backgroundVAO=this.plaqueVAO=this.glyphVAO=null;
      this.quad=this.fontTexture=this.noiseTexture=this.backgroundTexture=this.selectorTexture=this.backgroundFBO=null;
    }
    destroy(){
      if(this.destroyed)return;
      this.destroyed=true;this.loaded=false;this._generation++;
      cancelAnimationFrame(this.pendingFrame);this.pendingFrame=0;this.observer?.disconnect();
      for(const cancel of [...this._pendingFontDecodes])cancel();
      for(const [target,type,handler,options] of this.handlers)target.removeEventListener(type,handler,options);
      this.handlers.length=0;this._deleteResources();
    }''')
    source = once(source, 'gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.BLEND);',
                  'gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);')
    source = once(source, '''      gl.disable(gl.BLEND);const program=this.programs.background;this._uniforms(program);
      const emblem=this.layout.emblem;
      gl.uniform4fv(program.uniform('u_emblemRect'),emblem.rect);gl.uniform4fv(program.uniform('u_emblemUV'),emblem.uv);
      gl.uniform1f(program.uniform('u_emblemRange'),emblem.range);gl.uniform1f(program.uniform('u_emblem'),this.config.showEmblem?1:0);
      gl.bindVertexArray(this.backgroundVAO.array);gl.drawArrays(gl.TRIANGLES,0,6);''', '''      gl.disable(gl.BLEND);
      if(this.nativeMode){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}
      else{
        const program=this.programs.background;this._uniforms(program);const emblem=this.layout.emblem;
        gl.uniform4fv(program.uniform('u_emblemRect'),emblem.rect);gl.uniform4fv(program.uniform('u_emblemUV'),emblem.uv);
        gl.uniform1f(program.uniform('u_emblemRange'),emblem.range);gl.uniform1f(program.uniform('u_emblem'),this.config.showEmblem?1:0);
        gl.uniform1f(program.uniform('u_backgroundAlpha'),1); // standalone donor: opaque, as in the original page
        gl.bindVertexArray(this.backgroundVAO.array);gl.drawArrays(gl.TRIANGLES,0,6);
      }''')
    source = once(source, '      gl.enable(gl.BLEND);\n      this._uniforms(this.programs.plaque);',
                  '      gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);\n      this._uniforms(this.programs.plaque);')
    return source


def outputs(source_bytes):
    if sha(source_bytes) != SOURCE_SHA256:
        raise ValueError('Donor SHA256 differs from the reviewed source; stop and review the replacement.')
    html = source_bytes.decode('utf-8')
    scripts = re.findall(r'<script([^>]*)>([\s\S]*?)</script>', html)
    if len(scripts) != 6 or 'source-notices' not in scripts[-1][0]:
        raise ValueError('Unexpected donor script layout')
    bodies = [body for _, body in scripts]
    notices = json.loads(bodies[-1])
    if set(notices) != {'FONT-NOTICE.txt', 'LICENSE'}:
        raise ValueError('Unexpected source notices; preserve them before extraction')
    font = json.loads(re.search(r'window\.QUAKE_FONT\s*=\s*(\{[\s\S]*\});', bodies[0])[1])
    shader_source = once(bodies[1], 'uniform float u_emblem;\nuniform float u_scale;',
                         'uniform float u_emblem;\nuniform float u_backgroundAlpha;\nuniform float u_scale;')
    # Native engine text drawn "white" (M_PrintWhite) is a stock-white kind 3: the donor's own
    # kinds 0-2 stay byte-identical so the donor parity test remains meaningful.
    shader_source = once(shader_source, "        face *= u_copper*(kind>1.5 ? 1.58 : 1.);\n",
                         "        face *= u_copper*(kind>1.5 ? 1.58 : 1.);\n        if(kind>2.5)face=mix(face,vec3(dot(face,vec3(.30,.59,.11))*.92),.84);\n")
    shader_source = once(shader_source, 'fragColor=vec4(max(c,vec3(.002))*u_exposure,1.0);',
                         'fragColor=vec4(max(c,vec3(.002))*u_exposure,u_backgroundAlpha);')
    parts = [once(bodies[0], 'window.QUAKE_FONT =', 'export const QUAKE_FONT ='),
             once(shader_source, 'window.QUAKE_SHADERS =', 'export const QUAKE_SHADERS ='),
             once(bodies[2], 'window.QuakeFontLoader=', 'export const QuakeFontLoader='),
             renderer_module(bodies[3])]
    # (the @module header of the generated module: docs/module-layout.md)
    header = "/**\n * @module newer/ui/menu_webgl_source\n *\n * The supplied WebGL2 menu's shaders and data, generated by `tools/extract_menu_webgl.py` (do not edit: re-run the\n * tool).\n *\n * Types: plain values and functions; no exported classes.\n *\n * State: no mutable exports.\n *\n * Errors: throws at 4 places.\n */\n" + '// Generated by tools/extract_menu_webgl.py from the reviewed donor.\n// Source/license/provenance: docs/newer/menu-webgl/. Do not hand-edit.\n'
    module = header + '\n'.join(part.strip() for part in parts) + '\n'
    if re.search(r'window\.(?:QUAKE_FONT|QUAKE_SHADERS|QuakeFontLoader|QuakeMenu)\s*=', module):
        raise ValueError('Global donor registration survived ESM extraction')
    receipt = {
        'source': 'quake-menu-final.html', 'sourceSha256': SOURCE_SHA256,
        'sourceBytes': len(source_bytes), 'includedScripts': list(range(4)),
        'excludedScripts': {'4': 'optional HTML editor controls', '5': 'notices preserved as exact files'},
        'scriptSha256': [sha(body) for body in bodies[:4]],
        'fontAtlasSha256': sha(base64.b64decode(font['image'].split(',', 1)[1])),
        'fontDimensions': [font['metrics']['width'], font['metrics']['height']],
        'glyphs': len(font['metrics']['glyphs']), 'moduleSha256': sha(module),
        'adaptations': [
            'ESM exports replace window font/shader/loader/renderer registration',
            'externalFrame defaults false; true retains only context lifecycle listeners',
            'frame accepts bounded physical pixels and finite millisecond timestamps without DPR rescaling',
            'optional native text, panel, selector and slider commands reuse donor glyph, plaque and solid-Q materials with transparent gameplay overlay alpha',
            'shared original selector step serves RAF and external frames with original reduced-motion policy',
            'font readiness and generation guards prevent late upload/restoration after disposal',
            'idempotent resource cleanup handles partial program construction and restoration failure',
            'external capture restores caller framebuffer dimensions',
        ],
        'preserved': ['font atlas bytes', 'font metrics', 'all GLSL strings', 'layout/typography arithmetic', 'selector distance-field algorithm', 'default standalone input/RAF behavior'],
        'verificationLimits': 'Extraction identity and syntax are not GPU presentation or owner acceptance.',
    }
    readme = f'''# Donor menu renderer

Source: `quake-menu-final.html`, SHA-256 `{SOURCE_SHA256}`.
`SOURCE.json` records each included script, the embedded atlas, and the generated module.
The original font notice and MIT application-code license are reproduced verbatim in this directory.
The font/logos are not relicensed by the application-code license.

Regenerate with `python3 tools/extract_menu_webgl.py`; verify without writing with
`python3 tools/extract_menu_webgl.py --check`. `--out` may target an isolated directory.
Extraction refuses a changed source hash or adaptation anchor.

The module exports `QUAKE_FONT`, `QUAKE_SHADERS`, `QuakeFontLoader`, and `QuakeMenu`.
It contains the first four donor scripts. The HTML authoring/editor controls are excluded.
GLSL strings, atlas bytes, metrics, typography/layout and selector field construction remain donor code.

## Host frame API

Create `new QuakeMenu(canvas, {{config, externalFrame: true}})` and await `ready`.
Call `frame(width, height, timeMs, commands, backgroundOpacity)` only while the
host menu is open, then copy that completed framebuffer to the overlay at 1:1 pixels.
The optional command list uses `{{type:'text',text,x,y,size,kind}}`,
`{{type:'panel',x,y,w,h,well}}`, `{{type:'selector',x,y,size}}` and
`{{type:'slider',x,y,w,value}}`. Coordinates and dimensions are backing pixels.
These commands use the supplied glyph atlas, bronze shaders and Q selector.
A zero background alpha suppresses the donor backdrop in the native menu; only command geometry reaches the overlay.
Dimensions are physical pixels, not CSS pixels; the renderer applies no second DPR multiplier.
The host selects the dimensions. The renderer rejects values outside positive integer dimensions,
its GPU renderbuffer limit, an 8192-pixel edge, or the donor's 24-million-pixel live budget.
Time is finite monotonic milliseconds. The donor's selector update caps a step at 100 ms and
honors reduced motion and document visibility. `frame` returns false while unready, lost,
destroyed, or capturing; otherwise it completes one draw and returns true.

External mode installs only canvas context-loss/restoration listeners. It creates no RAF loop,
ResizeObserver, pointer/key listener, window resize, visibility-change, or motion-change listener.
The default `externalFrame: false` retains standalone donor input and RAF behavior.

`quake:error` reports context loss and restoration failures. Restoration replaces `ready`; rejection
remains observable through that promise. Generation guards reject stale async work, and destruction
settles pending decode waits without making the instance visible. `destroy()` is idempotent.
The host owns native menu actions, visibility, sizing, fallback, and eventual destruction.

Extraction/syntax checks do not qualify GPU appearance, integration, or owner acceptance.
'''
    result = {Path('src/newer/ui/menu_webgl_source.js'): module,
              Path('docs/newer/menu-webgl/SOURCE.json'): json.dumps(receipt, indent=2) + '\n',
              Path('docs/newer/menu-webgl/README.md'): readme}
    for name, notice in notices.items():
        result[Path('docs/newer/menu-webgl') / name] = notice
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'quake-menu-final.html')
    parser.add_argument('--out', type=Path, default=ROOT)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    expected = outputs(args.source.read_bytes())
    failures = []
    for relative, value in expected.items():
        path, encoded = args.out / relative, value.encode()
        if args.check:
            if not path.is_file() or path.read_bytes() != encoded:
                failures.append(str(relative))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(encoded)
    if failures:
        raise SystemExit('Generated donor outputs differ: ' + ', '.join(failures))
    print(('Verified' if args.check else 'Generated') + ' ' + str(len(expected)) + ' donor outputs; source ' + SOURCE_SHA256)


if __name__ == '__main__':
    main()
