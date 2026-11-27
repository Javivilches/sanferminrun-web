(() => {
  'use strict';
  let active = null;
  const stopTracks = stream => stream?.getTracks().forEach(t => t.stop());
  const el = (tag, text) => {const e=document.createElement(tag); if(text)e.textContent=text; return e;};
  function close() {
    const s=active; if(!s)return; active=null;
    clearTimeout(s.timer); clearTimeout(s.watchdog); clearInterval(s.tick);
    document.removeEventListener('visibilitychange',s.visibility);
    if(s.rec && s.rec.state !== 'inactive') { try{s.rec.stop();}catch{} }
    stopTracks(s.stream);
    if(s.ctx) {try{s.ctx.close().catch(()=>{});}catch{}}
    s.layer.remove();
    document.getElementById('canvas')?.focus({preventScroll:true});
  }
  function finish(s, bytes=null, error='') {
    if(active!==s)return;
    close(); s.callback(bytes,error);
  }
  function wav(audio, seconds) {
    const n=Math.min(audio.length,Math.floor(audio.sampleRate*seconds));
    if(n < audio.sampleRate*0.1)throw Error('short');
    const out=new ArrayBuffer(44+n*2), d=new DataView(out);
    const str=(at,txt)=>{for(let i=0;i<txt.length;i++)d.setUint8(at+i,txt.charCodeAt(i));};
    str(0,'RIFF');d.setUint32(4,36+n*2,true);str(8,'WAVE');str(12,'fmt ');
    d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);
    d.setUint32(24,audio.sampleRate,true);d.setUint32(28,audio.sampleRate*2,true);
    d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,n*2,true);
    const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i));
    let peak=0;
    for(let i=0;i<n;i++){
      let x=0; for(const c of channels)x+=c[i]; x=Math.max(-1,Math.min(1,x/channels.length));
      peak=Math.max(peak,Math.abs(x)); d.setInt16(44+i*2,Math.round(x*(x<0?32768:32767)),true);
    }
    if(peak < 0.0001)throw Error('silent');
    return out;
  }
  function fail(s,e){
    const name=e?.name;
    const msg=name==='NotAllowedError'||name==='PermissionDeniedError' ? 'Permiso de micrófono denegado. En Safari, permite el micrófono para esta web y vuelve a intentarlo.' : name==='NotFoundError' ? 'No se ha encontrado un micrófono.' : name==='NotReadableError' ? 'El micrófono no está disponible. Cierra otras apps que lo estén usando.' : 'No se pudo grabar o leer el audio. Comprueba el micrófono y vuelve a intentarlo.';
    finish(s,null,msg);
  }
  function stop(s){
    if(active!==s||!s.rec||s.rec.state==='inactive')return;
    clearTimeout(s.timer);clearInterval(s.tick);s.go.disabled=true;s.hint.textContent='Guardando…';
    try{s.rec.stop(); s.watchdog=setTimeout(()=>finish(s,null,'No se pudo finalizar la grabación. Inténtalo otra vez.'),12000);}catch(e){fail(s,e);}
  }
  async function begin(s){
    if(active!==s)return;
    s.go.disabled=true;s.hint.textContent='Permite el acceso al micrófono…';
    try{
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){finish(s,null,'La grabación requiere un navegador compatible y una conexión HTTPS.');return;}
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC){finish(s,null,'Este navegador no puede convertir la grabación.');return;}
      // Crear y activar el contexto directamente durante la pulsación real del usuario.
      s.ctx=new AC();s.ctx.resume().catch(()=>{});
      const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      if(active!==s){stopTracks(stream);return;}
      s.stream=stream;
      const chunks=[];
      const types=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
      const type=types.find(t=>MediaRecorder.isTypeSupported?.(t));
      try{s.rec=type?new MediaRecorder(stream,{mimeType:type}):new MediaRecorder(stream);}catch{s.rec=new MediaRecorder(stream);}
      s.rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
      s.rec.onerror=e=>fail(s,e.error);
      s.rec.onstop=async()=>{
        stopTracks(stream);
        if(active!==s)return;
        try{
          const bytes=await new Blob(chunks,{type:s.rec.mimeType||type||''}).arrayBuffer();
          if(active!==s)return;
          if(!bytes.byteLength)throw Error('empty');
          const audio=await new Promise((resolve,reject)=>s.ctx.decodeAudioData(bytes,resolve,reject));
          if(active!==s)return;
          finish(s,wav(audio,s.seconds));
        }catch(e){fail(s,e);}
      };
      s.rec.start();const start=performance.now();
      s.go.textContent='Parar y guardar';s.go.disabled=false;s.go.onclick=()=>stop(s);
      const update=()=>{s.hint.textContent=`Grabando… ${Math.min(s.seconds,(performance.now()-start)/1000).toFixed(1)} / ${s.seconds} s`;};
      update();s.tick=setInterval(update,100);s.timer=setTimeout(()=>stop(s),s.seconds*1000);
      for(const t of stream.getAudioTracks())t.onended=()=>{if(active===s&&s.rec?.state==='recording')stop(s);};
    }catch(e){fail(s,e);}
  }
  function open(seconds,callback){
    close(); const layer=el('div'),card=el('div');
    layer.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#0009;padding:16px;box-sizing:border-box;';
    card.style.cssText='width:min(100%,360px);box-sizing:border-box;padding:18px;border:1px solid #ffcb32;border-radius:12px;background:#132840;color:white;font:16px system-ui;text-align:center;';
    const title=el('h3','Grabar audio');title.style.cssText='color:#ffcb32;margin:0 0 12px;';
    const hint=el('p',`Pulsa para grabar hasta ${seconds} segundos.`);
    const go=el('button','Empezar grabación'), cancel=el('button','Cancelar');
    for(const b of [go,cancel]){b.type='button';b.style.cssText='display:block;width:100%;margin:8px 0;padding:12px;border:0;border-radius:6px;font:600 16px system-ui;';}
    go.style.background='#ffcb32';go.style.color='#132840';cancel.style.background='#254d70';cancel.style.color='white';
    card.append(title,hint,go,cancel);layer.append(card);document.body.append(layer);
    const s={layer,hint,go,callback,seconds:Math.max(1,Math.min(8,Number(seconds)||5))};active=s;
    go.onclick=()=>begin(s);cancel.onclick=()=>finish(s);
    s.visibility=()=>{if(document.hidden&&s.rec?.state==='recording')finish(s,null,'Grabación interrumpida. Vuelve a intentarlo.');};
    document.addEventListener('visibilitychange',s.visibility);
  }
  window.SFRRecorder={open,close};
})();
