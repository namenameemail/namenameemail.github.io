import{_ as e,c as t,d as n,g as r,h as i,i as a,l as o,n as s,o as c,p as l,r as u,t as d,v as f,y as p}from"./status-WxvXPKNc.js";var m=document.querySelector(`#app`),h=null;function g(){m.innerHTML=`
    <main class="page">
      <header class="hero">
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
  `}async function _(){g();let _=document.querySelector(`#status-mount`),{element:v,setState:y}=d();_.appendChild(v);let b=document.querySelector(`#loading-section`),x=document.querySelector(`#answer-section`),S=document.querySelector(`#answer-qr`),C=document.querySelector(`#copy-answer`),w=n();if(e(`guest page: init`,{hashLength:window.location.hash.length,hasOffer:!!w,offerLength:w?.length??0}),!w){b.classList.add(`hidden`),y(`failed`,`QR не содержит offer. Отсканируйте код с компьютера.`),s(m,`Откройте страницу через QR-код с компьютера.`);return}y(`gathering`);try{let n=t(w);if(n.type!==`offer`)throw Error(`Ожидался offer`);let s=await l(n);h=s.bundle;let d=o(s.answer);b.classList.add(`hidden`),x.classList.remove(`hidden`),y(`waiting-answer`,`Дождитесь, пока ПК примет answer`),await c(S,d,`Answer для компьютера`),C.addEventListener(`click`,async()=>{try{await navigator.clipboard.writeText(d),C.textContent=`Скопировано!`,setTimeout(()=>{C.textContent=`Скопировать answer`},2e3)}catch{C.textContent=`Не удалось скопировать`}}),r(h.pc,t=>{e(`guest page: connection state`,{state:t,iceConnectionState:h.pc.iceConnectionState,signalingState:h.pc.signalingState}),t===`connecting`?y(`connecting`):t===`connected`?y(`connected`):t===`failed`&&(p(`guest page: connection failed`,{iceConnectionState:h.pc.iceConnectionState,iceGatheringState:h.pc.iceGatheringState}),y(`failed`,`Проверьте интернет или попробуйте снова`))}),i(h.channel,`guest`).then(()=>{e(`guest page: datachannel open, showing transfer panel`),x.classList.add(`hidden`),y(`connected`);let t=document.querySelector(`#transfer-mount`),{element:n}=u(h.channel);t.appendChild(n),a(n)}).catch(t=>{e(`guest page: datachannel still pending or failed`,{message:t instanceof Error?t.message:String(t),channelState:h?.channel.readyState,connectionState:h?.pc.connectionState})})}catch(e){f(`guest page: init failed`,e),b.classList.add(`hidden`),y(`failed`),s(m,e instanceof Error?e.message:`Не удалось подключиться`)}}_();