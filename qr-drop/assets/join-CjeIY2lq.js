import{C as e,_ as t,a as n,b as r,f as i,h as a,i as o,l as s,n as c,p as l,r as u,s as d,t as f,u as p,v as m,x as h,y as g}from"./version-C3Y_j1P-.js";var _=document.querySelector(`#app`),v=null;function y(){_.innerHTML=`
    <main class="page">
      <header class="hero">
        <p class="version">v${f}</p>
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
  `}async function b(){y();let f=document.querySelector(`#status-mount`),{element:b,setState:x}=c();f.appendChild(b);let S=document.querySelector(`#loading-section`),C=document.querySelector(`#answer-section`),w=document.querySelector(`#answer-qr`),T=document.querySelector(`#copy-answer`),E=i();if(r(`guest page: init`,{hashLength:window.location.hash.length,hasOffer:!!E,offerLength:E?.length??0}),!E){S.classList.add(`hidden`),x(`failed`,`QR не содержит offer. Отсканируйте код с компьютера.`),u(_,`Откройте страницу через QR-код с компьютера.`);return}x(`gathering`);try{let i=s(E);if(i.type!==`offer`)throw Error(`Ожидался offer`);let c=await a(i);v=c.bundle;let f=p(c.answer);S.classList.add(`hidden`),C.classList.remove(`hidden`),x(`waiting-host`),await d(w,f,`Answer для компьютера`),T.addEventListener(`click`,async()=>{try{await navigator.clipboard.writeText(f),T.textContent=`Скопировано!`,setTimeout(()=>{T.textContent=`Скопировать answer`},2e3)}catch{T.textContent=`Не удалось скопировать`}});let y=!1,b=g(v.pc,()=>{y=!0,x(`connecting`,`ПК принял answer, устанавливаем соединение…`)});m(v.pc,t=>{r(`guest page: connection state`,{state:t,hostAnswerApplied:y,iceConnectionState:v.pc.iceConnectionState,signalingState:v.pc.signalingState}),t===`connected`?x(`connected`):t===`failed`&&y&&(e(`guest page: connection failed after host answer`,{iceConnectionState:v.pc.iceConnectionState,iceGatheringState:v.pc.iceGatheringState}),x(`failed`,`Разные сети без TURN — попробуйте одну Wi‑Fi или вставьте answer на ПК ещё раз`))}),t(v.channel,`guest`,l).then(()=>{b(),r(`guest page: datachannel open, showing transfer panel`),C.classList.add(`hidden`),x(`connected`);let e=document.querySelector(`#transfer-mount`),{element:t}=o(v.channel);e.appendChild(t),n(t)}).catch(e=>{b(),h(`guest page: connection timed out or failed`,e,{hostAnswerApplied:y,channelState:v?.channel.readyState,connectionState:v?.pc.connectionState,iceConnectionState:v?.pc.iceConnectionState}),y?x(`failed`,`Соединение не установилось — попробуйте одну Wi‑Fi сеть`):x(`failed`,`ПК ещё не принял answer — нажмите «Скопировать» и вставьте текст на компьютере`),u(_,y?`ICE не пробился. Подключите оба устройства к одной Wi‑Fi или проверьте VPN.`:`На компьютере нажмите «Применить answer» после вставки текста с телефона.`)})}catch(e){h(`guest page: init failed`,e),S.classList.add(`hidden`),x(`failed`),u(_,e instanceof Error?e.message:`Не удалось подключиться`)}}b();