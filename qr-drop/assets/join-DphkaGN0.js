import{c as e,d as t,g as n,h as r,i,l as a,n as o,o as s,p as c,r as l,t as u}from"./status-ev5RoH5G.js";var d=document.querySelector(`#app`),f=null;function p(){d.innerHTML=`
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
  `}async function m(){p();let m=document.querySelector(`#status-mount`),{element:h,setState:g}=u();m.appendChild(h);let _=document.querySelector(`#loading-section`),v=document.querySelector(`#answer-section`),y=document.querySelector(`#answer-qr`),b=document.querySelector(`#copy-answer`),x=t();if(!x){_.classList.add(`hidden`),g(`failed`,`QR не содержит offer. Отсканируйте код с компьютера.`),o(d,`Откройте страницу через QR-код с компьютера.`);return}g(`gathering`);try{let t=e(x);if(t.type!==`offer`)throw Error(`Ожидался offer`);let o=await c(t);f=o.bundle;let u=a(o.answer);_.classList.add(`hidden`),v.classList.remove(`hidden`),g(`waiting-answer`,`Дождитесь, пока ПК примет answer`),await s(y,u,`Answer для компьютера`),b.addEventListener(`click`,async()=>{try{await navigator.clipboard.writeText(u),b.textContent=`Скопировано!`,setTimeout(()=>{b.textContent=`Скопировать answer`},2e3)}catch{b.textContent=`Не удалось скопировать`}}),n(f.pc,e=>{e===`connecting`?g(`connecting`):e===`connected`?g(`connected`):e===`failed`&&g(`failed`,`Проверьте интернет или попробуйте снова`)}),r(f.channel).then(()=>{v.classList.add(`hidden`),g(`connected`);let e=document.querySelector(`#transfer-mount`),{element:t}=l(f.channel);e.appendChild(t),i(t)}).catch(()=>{})}catch(e){_.classList.add(`hidden`),g(`failed`),o(d,e instanceof Error?e.message:`Не удалось подключиться`)}}m();