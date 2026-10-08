# Donor menu renderer

Source: `quake-menu-final.html`, SHA-256 `0c17c95648f1bcfa20fe2d882814ed11577d2f423cf7682a19535fb889d1f8ce`.
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

Create `new QuakeMenu(canvas, {config, externalFrame: true})` and await `ready`.
Call `frame(width, height, timeMs, commands, backgroundOpacity)` only while the
host menu is open, then copy that completed framebuffer to the overlay at 1:1 pixels.
The optional command list uses `{type:'text',text,x,y,size,kind}`,
`{type:'panel',x,y,w,h,well}`, `{type:'selector',x,y,size}` and
`{type:'slider',x,y,w,value}`. Coordinates and dimensions are backing pixels.
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
