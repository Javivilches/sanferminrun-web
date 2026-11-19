(() => {
  "use strict";
  const LIMIT = 1536;
  let active = null;

  const make = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const stop = (stream) => stream?.getTracks().forEach(track => track.stop());

  function close() {
    if (!active) return;
    const old = active;
    active = null;
    document.removeEventListener("keydown", old.onKey);
    document.removeEventListener("visibilitychange", old.onVisibility);
    stop(old.stream);
    if (old.video) {
      old.video.pause();
      old.video.srcObject = null;
    }
    old.layer.remove();
    document.getElementById("canvas")?.focus({preventScroll: true});
  }

  function finish(ctx, buffer = null, error = "") {
    if (ctx !== active) return;
    close();
    ctx.callback(buffer, error);
  }

  function normalizedJpeg(source, width, height, mirror = false) {
    if (!width || !height) return Promise.reject(new Error("Imagen vacía"));
    const scale = Math.min(1, LIMIT / Math.max(width, height));
    const canvas = make("canvas", {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    });
    const g = canvas.getContext("2d", {alpha: false});
    if (!g) return Promise.reject(new Error("No hay lienzo"));
    g.fillStyle = "white";
    g.fillRect(0, 0, canvas.width, canvas.height);
    if (mirror) {
      g.translate(canvas.width, 0);
      g.scale(-1, 1);
    }
    g.drawImage(source, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) blob.arrayBuffer().then(resolve, reject);
        else reject(new Error("No hay foto"));
      }, "image/jpeg", 0.92);
    });
  }

  async function fileChosen(ctx, file) {
    if (!file || ctx !== active) return;
    if (file.size > 45_000_000) {
      ctx.hint.textContent = "Esa imagen es demasiado grande. Elige otra.";
      return;
    }
    ctx.hint.textContent = "Abriendo la imagen…";
    const url = URL.createObjectURL(file);
    const img = make("img");
    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      if (ctx !== active) return;
      const bytes = await normalizedJpeg(img, img.naturalWidth, img.naturalHeight);
      finish(ctx, bytes);
    } catch {
      if (ctx === active) {
        ctx.hint.textContent = "Safari no pudo abrir esa imagen. Elige otra o prueba con una copia JPG o PNG.";
      }
    } finally {
      URL.revokeObjectURL(url);
      img.removeAttribute("src");
    }
  }

  function button(text, click, primary = false) {
    const b = make("button", {type: "button", textContent: text});
    b.className = primary ? "sfr-photo-primary" : "";
    b.addEventListener("click", click);
    return b;
  }

  function addChooser(ctx, capture) {
    const input = make("input", {type: "file", accept: "image/*"});
    input.hidden = true;
    if (capture) input.setAttribute("capture", "user");
    input.addEventListener("change", () => fileChosen(ctx, input.files?.[0]));
    ctx.card.append(input);
    return button(capture ? "Usar la cámara del iPhone" : "Abrir Fotos", () => {
      input.value = "";
      input.click();
    }, !capture);
  }

  async function enableCamera(ctx, start, take) {
    start.disabled = true;
    ctx.hint.textContent = "Permite el acceso a la cámara si Safari te lo pide.";
    let stream;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("No hay cámara");
      stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: {ideal: "user"}, width: {ideal: 1280}, height: {ideal: 960}},
        audio: false,
      });
      if (ctx !== active) { stop(stream); return; }
      ctx.stream = stream;
      ctx.video.srcObject = stream;
      ctx.video.hidden = false;
      await ctx.video.play();
      if (ctx !== active) return;
      await new Promise((resolve, reject) => {
        if (ctx.video.videoWidth > 0 && ctx.video.readyState >= 2) { resolve(); return; }
        const timeout = setTimeout(() => reject(new Error("La cámara no está lista")), 8000);
        ctx.video.addEventListener("loadeddata", () => {
          clearTimeout(timeout);
          resolve();
        }, {once: true});
      });
      if (ctx !== active) return;
      ctx.hint.textContent = "Encuadra tu cara y pulsa Hacer foto.";
      take.hidden = false;
      start.hidden = true;
      ctx.fallback.hidden = true;
    } catch {
      stop(stream);
      if (ctx !== active) return;
      ctx.stream = null;
      ctx.video.srcObject = null;
      ctx.video.hidden = true;
      start.disabled = false;
      ctx.hint.textContent = "No se pudo abrir la vista previa. Puedes usar la cámara del iPhone o revisar el permiso en Safari.";
    }
  }

  function open(selfie, callback) {
    close();
    const layer = make("div", {className: "sfr-photo-layer"});
    const card = make("section", {className: "sfr-photo-card"});
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "sfr-photo-title");
    const title = make("h2", {
      id: "sfr-photo-title",
      textContent: selfie ? "Hacer selfie" : "Elegir foto",
    });
    const hint = make("p", {
      textContent: selfie ? "Abre la cámara frontal para hacerte una foto."
                         : "Elige una imagen en Fotos o Archivos.",
    });
    hint.setAttribute("aria-live", "polite");
    const ctx = {layer, card, hint, callback, stream: null, video: null};
    ctx.onKey = e => {
      if (e.key === "Escape") { e.preventDefault(); finish(ctx); }
    };
    ctx.onVisibility = () => {
      if (document.hidden && ctx.stream) finish(ctx);
    };
    active = ctx;
    layer.append(card);
    card.append(title, hint);
    if (selfie) {
      const video = make("video", {autoplay: true, muted: true, playsInline: true, hidden: true});
      video.setAttribute("playsinline", "");
      ctx.video = video;
      card.append(video);
      const take = button("Hacer foto", async () => {
        take.disabled = true;
        try {
          const bytes = await normalizedJpeg(video, video.videoWidth, video.videoHeight, true);
          finish(ctx, bytes);
        } catch {
          take.disabled = false;
          hint.textContent = "No se pudo tomar la foto. Inténtalo otra vez.";
        }
      }, true);
      take.hidden = true;
      const start = button("Abrir cámara frontal", () => enableCamera(ctx, start, take), true);
      ctx.fallback = addChooser(ctx, true);
      card.append(start, take, ctx.fallback);
    } else {
      card.append(addChooser(ctx, false));
    }
    card.append(button("Cancelar", () => finish(ctx)));
    document.body.append(layer);
    document.addEventListener("keydown", ctx.onKey);
    document.addEventListener("visibilitychange", ctx.onVisibility);
    card.querySelector(".sfr-photo-primary:not([hidden])")?.focus({preventScroll: true});
  }

  window.SFRPhoto = Object.freeze({open, close});
  const css = make("style", {textContent: `
    .sfr-photo-layer {position:fixed;inset:0;z-index:50;display:grid;place-items:center;
      background:#0c1521e8;box-sizing:border-box;padding:16px;touch-action:manipulation}
    .sfr-photo-card {width:min(100%,390px);padding:20px;box-sizing:border-box;max-height:92vh;
      overflow:auto;touch-action:pan-y;border-radius:16px;background:#16293d;color:#fff;
      font:16px/1.35 system-ui,sans-serif;text-align:center;border:1px solid #708093}
    .sfr-photo-card h2 {margin:0 0 10px;font-size:25px;color:#ffd16d}
    .sfr-photo-card p {margin:0 0 12px}
    .sfr-photo-card video {display:block;margin:0 auto 14px;width:100%;max-height:43vh;
      object-fit:contain;border-radius:8px;transform:scaleX(-1);background:#0b1520}
    .sfr-photo-card button {display:block;margin:9px 0 0;width:100%;min-height:45px;
      border-radius:8px;border:1px solid #71869c;background:#233b55;color:#fff;
      font:600 16px/1.2 system-ui,sans-serif;padding:10px}
    .sfr-photo-card button.sfr-photo-primary {background:#ffd16d;color:#182d45;border-color:#ffd16d}
    .sfr-photo-card button:disabled {opacity:.6}
    .sfr-photo-card [hidden] {display:none}
  `});
  document.head.append(css);
})();
