import{_ as e,a as t,b as n,f as r,g as i,i as a,l as o,m as s,n as c,r as l,s as u,t as d,u as f,v as p,y as m}from"./version-BdzI1d9s.js";var h=document.querySelector(`#app`),g=null;function _(){h.innerHTML=`
    <main class="page">
      <header class="hero">
        <p class="version">v${d}</p>
        <h1>QR Drop</h1>
        <p class="subtitle">Подключение к сессии</p>
      </header>
      <div id="status-mount"></div>
      <section id="loading-section" class="card">
        <p>Подготовка answer…</p>
      </section>
      <section id="answer-section" class="card hidden">
        <h2>Покажите этот QR на ПК</h2>
        <p class="hint">Или нажмите «Скопировать» и вставьте текст на компьютере.</p>
        <div id="answer-qr"></div>
        <button id="copy-answer" type="button" class="btn btn-secondary">
          Скопировать answer
        </button>
      </section>
      <div id="transfer-mount"></div>
    </main>
  `}async function v(){_();let d=document.querySelector(`#status-mount`),{element:v,setState:y}=c();d.appendChild(v);let b=document.querySelector(`#loading-section`),x=document.querySelector(`#answer-section`),S=document.querySelector(`#answer-qr`),C=document.querySelector(`#copy-answer`),w=r();if(p(`guest page: init`,{hashLength:window.location.hash.length,hasOffer:!!w,offerLength:w?.length??0}),!w){b.classList.add(`hidden`),y(`failed`,`QR не содержит offer. Отсканируйте код с компьютера.`),l(h,`Откройте страницу через QR-код с компьютера.`);return}y(`gathering`);try{let r=o(w);if(r.type!==`offer`)throw Error(`Ожидался offer`);let c=await s(r);g=c.bundle;let l=f(c.answer);b.classList.add(`hidden`),x.classList.remove(`hidden`),y(`waiting-answer`,`Дождитесь, пока ПК примет answer`),await u(S,l,`Answer для компьютера`),C.addEventListener(`click`,async()=>{try{await navigator.clipboard.writeText(l),C.textContent=`Скопировано!`,setTimeout(()=>{C.textContent=`Скопировать answer`},2e3)}catch{C.textContent=`Не удалось скопировать`}}),e(g.pc,e=>{p(`guest page: connection state`,{state:e,iceConnectionState:g.pc.iceConnectionState,signalingState:g.pc.signalingState}),e===`connecting`?y(`connecting`):e===`connected`?y(`connected`):e===`failed`&&(n(`guest page: connection failed`,{iceConnectionState:g.pc.iceConnectionState,iceGatheringState:g.pc.iceGatheringState}),y(`failed`,`Проверьте интернет или попробуйте снова`))}),i(g.channel,`guest`).then(()=>{p(`guest page: datachannel open, showing transfer panel`),x.classList.add(`hidden`),y(`connected`);let e=document.querySelector(`#transfer-mount`),{element:n}=a(g.channel);e.appendChild(n),t(n)}).catch(e=>{p(`guest page: datachannel still pending or failed`,{message:e instanceof Error?e.message:String(e),channelState:g?.channel.readyState,connectionState:g?.pc.connectionState})})}catch(e){m(`guest page: init failed`,e),b.classList.add(`hidden`),y(`failed`),l(h,e instanceof Error?e.message:`Не удалось подключиться`)}}v();