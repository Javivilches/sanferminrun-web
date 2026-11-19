(() => {
  'use strict';
  const ios = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let closeCurrent;
  function panel(title, copy) {
    if (closeCurrent) closeCurrent();
    const bg = document.createElement('div');
    bg.style.cssText = 'position:fixed;inset:0;background:#181217ad;z-index:2147483647;display:grid;place-items:center;padding:1rem;font:16px system-ui,sans-serif;box-sizing:border-box';
    const card = document.createElement('section');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', title);
    card.style.cssText = 'background:#fff5e5;color:#291f25;padding:20px;border-radius:14px;width:min(100%,360px);box-sizing:border-box;box-shadow:0 8px 28px #0008';
    const h = document.createElement('h2');
    h.textContent = title;
    h.style.margin = '0 0 12px';
    const p = document.createElement('p');
    p.textContent = copy;
    card.append(h, p);
    bg.append(card);
    document.body.append(bg);
    let onClose;
    const close = () => {
      bg.remove();
      if (closeCurrent === close) closeCurrent = null;
      if (onClose) { const cb = onClose; onClose = null; cb(); }
      document.querySelector('canvas')?.focus({preventScroll:true});
    };
    closeCurrent = close;
    const action = (label, click, primary = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'display:block;width:100%;padding:11px;margin-top:8px;border:1px solid #851b31;border-radius:8px;font:inherit;font-weight:600;' +
        (primary ? 'color:white;background:#851b31' : 'color:#851b31;background:transparent');
      b.onclick = click;
      card.append(b);
      return b;
    };
    return {close, action, message: p, onClose: cb => { onClose = cb; }};
  }
  if ((ios || navigator.maxTouchPoints > 0) && window.DeviceMotionEvent) {
    let receiving = false, last = 0, trial;
    const motion = {x: 0, y: 0, z: 0, request(done) {
      if (Date.now() - last < 1250) { done(true); return; }
      const dialog = panel('Control por inclinación', 'Permite el acceso al movimiento del móvil para controlar al corredor.');
      let complete = false;
      const finish = ok => {
        if (complete) return;
        complete = true;
        clearTimeout(trial);
        trial = undefined;
        wake = null;
        dialog.close();
        done(ok);
      };
      dialog.onClose(() => finish(false));
      const start = dialog.action('Permitir movimiento', async () => {
        start.disabled = true;
        try {
          if (typeof DeviceMotionEvent.requestPermission === 'function' &&
              await DeviceMotionEvent.requestPermission() !== 'granted') { finish(false); return; }
          if (complete) return;
          if (!receiving) {
            receiving = true;
            window.addEventListener('devicemotion', readMotion, {passive:true});
          }
          wake = () => finish(true);
          trial = setTimeout(() => finish(false), 1800);
        } catch { finish(false); }
      }, true);
      dialog.action('Seguir con cursores', () => finish(false));
    }};
    let wake;
    function readMotion(e) {
      const a = e.accelerationIncludingGravity;
      if (!a || ![a.x,a.y,a.z].every(Number.isFinite) || Math.hypot(a.x,a.y,a.z) < 0.5) return;
      [motion.x,motion.y,motion.z] = [a.x,a.y,a.z];
      last = Date.now();
      if (wake) wake();
    }
    window.SFRDeviceMotion = motion;
  }
  window.SFRShare = {open(base64, filename, mime) {
    const decoded = atob(base64);
    const bytes = new Uint8Array(decoded.length);
    for (let i=0;i<decoded.length;i++) bytes[i] = decoded.charCodeAt(i);
    const file = new File([bytes],filename,{type:mime});
    const dialog = panel(mime.startsWith('video/') ? 'Vídeo del encierro' : 'Foto del encierro',
      'Comparte el recuerdo o guárdalo en el dispositivo.');
    const url = URL.createObjectURL(file);
    dialog.onClose(() => { setTimeout(() => URL.revokeObjectURL(url), 30000); });
    const data = {files:[file]};
    if (navigator.share && navigator.canShare?.(data)) dialog.action('Compartir', async () => {
      try { await navigator.share(data); dialog.close(); }
      catch (error) {
        if (error.name !== 'AbortError') dialog.message.textContent = 'No se pudo abrir el menú de compartir. Puedes guardar el archivo.';
      }
    }, true);
    dialog.action('Guardar archivo', () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
    });
    dialog.action('Volver al juego', dialog.close);
  }};
  window.addEventListener('sfr:ready', () => {
    if (!ios || navigator.standalone || matchMedia('(display-mode: standalone)').matches) return;
    const key = 'sfr-ios-install-tip-seen';
    try { if (localStorage.getItem(key) === '1') return; } catch {}
    const dialog = panel('Juega a pantalla completa', 'En Safari, toca Compartir y luego Añadir a pantalla de inicio. Si aparece «Abrir como app web», actívalo. Abre el juego desde el nuevo icono para jugar sin la barra de Safari.');
    dialog.action('Entendido', () => {
      try { localStorage.setItem(key,'1'); } catch {}
      dialog.close();
    }, true);
  }, {once:true});
})();
