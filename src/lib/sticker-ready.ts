// Inlined in <head> (app/layout.tsx), before the body is parsed: marks every About-demo sticker (img.ebd-st) data-ld
// as it loads, from a capture-phase listener on the document (load events don't bubble). The demo's server-rendered
// poster keeps each sticker hidden until it has loaded (no half-drawn frames); with this, a sticker shows the moment its
// file is in, before the page's JavaScript has arrived. After hydration the Sticker's own ref and onLoad do the same.
export const STICKER_READY_SCRIPT = `document.addEventListener("load",function(e){var t=e.target;if(t&&t.tagName==="IMG"&&t.classList.contains("ebd-st")&&t.naturalWidth)t.setAttribute("data-ld","")},true)`
