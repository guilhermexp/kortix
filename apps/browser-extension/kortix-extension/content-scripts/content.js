var content=(function(){"use strict";function Ae(n){return n}const u=globalThis.browser?.runtime?.id?globalThis.browser:globalThis.chrome,ce="http://localhost:3001",b={BEARER_TOKEN:"bearer-token",REFRESH_TOKEN:"refresh-token",USER_DATA:"user-data",AUTO_SEARCH_ENABLED:"sm-auto-search-enabled"},y={TWITTER_IMPORT_BUTTON:"sm-twitter-import-button",KORTIX_TOAST:"sm-toast",CHATGPT_INPUT_BAR_ELEMENT:"sm-chatgpt-input-bar-element",CLAUDE_INPUT_BAR_ELEMENT:"sm-claude-input-bar-element",T3_INPUT_BAR_ELEMENT:"sm-t3-input-bar-element"},w={BUTTON_SHOW_DELAY:2e3,TOAST_DURATION:3e3,RATE_LIMIT_BASE_WAIT:6e4,PAGINATION_DELAY:1e3,AUTO_SEARCH_DEBOUNCE_DELAY:1500,OBSERVER_THROTTLE_DELAY:300,ROUTE_CHECK_INTERVAL:2e3,API_REQUEST_TIMEOUT:1e4},E={TWITTER:["x.com","twitter.com"],CHATGPT:["chatgpt.com","chat.openai.com"],CLAUDE:["claude.ai"],T3:["t3.chat"],KORTIX:["localhost",new URL(ce).hostname]},T={SAVE_MEMORY:"sm-save-memory",SHOW_TOAST:"sm-show-toast",BATCH_IMPORT_ALL:"sm-batch-import-all",IMPORT_UPDATE:"sm-import-update",IMPORT_DONE:"sm-import-done",GET_RELATED_MEMORIES:"sm-get-related-memories",CAPTURE_PROMPT:"sm-capture-prompt"};function de(n){const e=document.createElement("div");if(e.id=y.KORTIX_TOAST,e.style.cssText=`
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    background: #ffffff;
    border-radius: 9999px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    color: #374151;
    min-width: 200px;
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
    box-shadow: 0 4px 24px 0 rgba(0,0,0,0.18), 0 1.5px 6px 0 rgba(0,0,0,0.12);
  `,!document.getElementById("kortix-toast-styles")){const o=document.createElement("style");o.id="kortix-toast-styles",o.textContent=`
      @font-face {
        font-family: 'Space Grotesk';
        font-style: normal;
        font-weight: 300;
        font-display: swap;
        src: url('${chrome.runtime.getURL("fonts/SpaceGrotesk-Light.ttf")}') format('truetype');
      }
      @font-face {
        font-family: 'Space Grotesk';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('${chrome.runtime.getURL("fonts/SpaceGrotesk-Regular.ttf")}') format('truetype');
      }
      @font-face {
        font-family: 'Space Grotesk';
        font-style: normal;
        font-weight: 500;
        font-display: swap;
        src: url('${chrome.runtime.getURL("fonts/SpaceGrotesk-Medium.ttf")}') format('truetype');
      }
      @font-face {
        font-family: 'Space Grotesk';
        font-style: normal;
        font-weight: 600;
        font-display: swap;
        src: url('${chrome.runtime.getURL("fonts/SpaceGrotesk-SemiBold.ttf")}') format('truetype');
      }
      @font-face {
        font-family: 'Space Grotesk';
        font-style: normal;
        font-weight: 700;
        font-display: swap;
        src: url('${chrome.runtime.getURL("fonts/SpaceGrotesk-Bold.ttf")}') format('truetype');
      }
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes fadeOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `,document.head.appendChild(o)}const t=document.createElement("div");t.style.cssText="width: 20px; height: 20px; flex-shrink: 0;";let r=document.createElement("span");switch(r.style.fontWeight="500",n){case"loading":t.innerHTML=`
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 6V2" stroke="#6366f1" stroke-width="2" stroke-linecap="round"/>
          <path d="M12 22V18" stroke="#6366f1" stroke-width="2" stroke-linecap="round" opacity="0.3"/>
          <path d="M20.49 8.51L18.36 6.38" stroke="#6366f1" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
          <path d="M5.64 17.64L3.51 15.51" stroke="#6366f1" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
          <path d="M22 12H18" stroke="#6366f1" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
          <path d="M6 12H2" stroke="#6366f1" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
          <path d="M20.49 15.49L18.36 17.62" stroke="#6366f1" stroke-width="2" stroke-linecap="round" opacity="0.9"/>
          <path d="M5.64 6.36L3.51 8.49" stroke="#6366f1" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
        </svg>
      `,t.style.animation="spin 1s linear infinite",r.textContent="Adding to Memory...";break;case"success":{const o=u.runtime.getURL("/icon-16.png");t.innerHTML=`<img src="${o}" width="20" height="20" alt="Success" style="border-radius: 2px;" />`,r.textContent="Added to Memory";break}case"error":{t.innerHTML=`
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" fill="#ef4444"/>
          <path d="M15 9L9 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9 9L15 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;const o=document.createElement("div");o.style.cssText="display: flex; flex-direction: column; gap: 2px;";const c=document.createElement("span");c.style.cssText="font-weight: 500; line-height: 1.2;",c.textContent="Failed to save memory";const i=document.createElement("span");i.style.cssText="font-size: 12px; color: #6b7280; font-weight: 400; line-height: 1.2;",i.textContent="Make sure you are logged in",o.appendChild(c),o.appendChild(i),r=o;break}}return e.appendChild(t),e.appendChild(r),e}function le(n){const e=document.createElement("div");e.id=y.TWITTER_IMPORT_BUTTON,e.style.cssText=`
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 2147483646;
    background: #ffffff;
    color: black;
    border: none;
    border-radius: 50px;
    padding: 10px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s ease;
  `;const t=u.runtime.getURL("/icon-16.png");return e.innerHTML=`
    <img src="${t}" width="20" height="20" alt="Save to Memory" style="border-radius: 4px;" />
    <span style="font-weight: 500; font-size: 12px;">Import Bookmarks</span>
  `,e.addEventListener("mouseenter",()=>{e.style.opacity="0.8",e.style.boxShadow="0 4px 12px rgba(29, 155, 240, 0.4)"}),e.addEventListener("mouseleave",()=>{e.style.opacity="1",e.style.boxShadow="0 2px 8px rgba(29, 155, 240, 0.3)"}),e.addEventListener("click",n),e}function me(n){const e=document.createElement("div");e.style.cssText=`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: auto;
    height: 24px;
    cursor: pointer;
    transition: opacity 0.2s ease;
    border-radius: 50%;
  `;const r=u.runtime.getURL("/icon-16.png");return e.innerHTML=`
    <img src="${r}" width="20" height="20" alt="Save to Memory" style="border-radius: 50%;" />
  `,e.addEventListener("mouseenter",()=>{e.style.opacity="0.8"}),e.addEventListener("mouseleave",()=>{e.style.opacity="1"}),e.addEventListener("click",o=>{o.stopPropagation(),o.preventDefault(),n()}),e}function ue(n){const e=document.createElement("div");e.style.cssText=`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: auto;
    height: 32px;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 6px;
    background: transparent;
  `;const r=u.runtime.getURL("/icon-16.png");return e.innerHTML=`
    <img src="${r}" width="20" height="20" alt="Get Related Memories from Kortix" style="border-radius: 4px;" />
  `,e.addEventListener("mouseenter",()=>{e.style.backgroundColor="rgba(0, 0, 0, 0.05)",e.style.borderColor="rgba(0, 0, 0, 0.2)"}),e.addEventListener("mouseleave",()=>{e.style.backgroundColor="transparent",e.style.borderColor="rgba(0, 0, 0, 0.1)"}),e.addEventListener("click",o=>{o.stopPropagation(),o.preventDefault(),n()}),e}function pe(n){const e=document.createElement("div");e.style.cssText=`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: auto;
    height: 32px;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 6px;
    background: transparent;
  `;const r=u.runtime.getURL("/icon-16.png");return e.innerHTML=`
    <img src="${r}" width="20" height="20" alt="Get Related Memories from Kortix" style="border-radius: 4px;" />
  `,e.addEventListener("mouseenter",()=>{e.style.backgroundColor="rgba(0, 0, 0, 0.05)",e.style.borderColor="rgba(0, 0, 0, 0.2)"}),e.addEventListener("mouseleave",()=>{e.style.backgroundColor="transparent",e.style.borderColor="rgba(0, 0, 0, 0.1)"}),e.addEventListener("click",o=>{o.stopPropagation(),o.preventDefault(),n()}),e}const m={isOnDomain(n){return n.includes(window.location.hostname)},isDarkMode(){return document.documentElement.getAttribute("style")?.includes("color-scheme: dark")||!1},elementExists(n){return!!document.getElementById(n)},removeElement(n){document.getElementById(n)?.remove()},showToast(n,e=w.TOAST_DURATION){const t=document.getElementById(y.KORTIX_TOAST);if((n==="success"||n==="error")&&t){const c=t.querySelector("div"),i=t.querySelector("span");if(c&&i){if(n==="success"){const a=u.runtime.getURL("/icon-16.png");c.innerHTML=`<img src="${a}" width="20" height="20" alt="Success" style="border-radius: 2px;" />`,c.style.animation="",i.textContent="Added to Memory"}else if(n==="error"){c.innerHTML=`
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<circle cx="12" cy="12" r="10" fill="#ef4444"/>
							<path d="M15 9L9 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							<path d="M9 9L15 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					`,c.style.animation="";const a=document.createElement("div");a.style.cssText="display: flex; flex-direction: column; gap: 2px;";const l=document.createElement("span");l.style.cssText="font-weight: 500; line-height: 1.2;",l.textContent="Failed to save memory";const s=document.createElement("span");s.style.cssText="font-size: 12px; color: #6b7280; font-weight: 400; line-height: 1.2;",s.textContent="Make sure you are logged in",a.appendChild(l),a.appendChild(s),i.innerHTML="",i.appendChild(a)}return setTimeout(()=>{document.body.contains(t)&&(t.style.animation="fadeOut 0.3s ease-out",setTimeout(()=>{document.body.contains(t)&&t.remove()},300))},e),t}}document.querySelectorAll(`#${y.KORTIX_TOAST}`).forEach(c=>{c.remove()});const o=de(n);return document.body.appendChild(o),(n==="success"||n==="error")&&setTimeout(()=>{document.body.contains(o)&&(o.style.animation="fadeOut 0.3s ease-out",setTimeout(()=>{document.body.contains(o)&&o.remove()},300))},e),o}};let G=null,H=null,k=null,S=null;function Z(){m.isOnDomain(E.CHATGPT)&&(document.body.hasAttribute("data-chatgpt-initialized")||(setTimeout(()=>{F(),K(),D()},2e3),ge(),fe(),document.body.setAttribute("data-chatgpt-initialized","true")))}function fe(){H&&H.disconnect(),k&&clearInterval(k),S&&(clearTimeout(S),S=null);let n=window.location.href;const e=()=>{window.location.href!==n&&(n=window.location.href,console.log("ChatGPT route changed, re-adding kortix elements"),setTimeout(()=>{F(),K(),D()},1e3))};k=setInterval(e,2e3),H=new MutationObserver(t=>{if(S)return;let r=!1;t.forEach(o=>{o.type==="childList"&&o.addedNodes.length>0&&o.addedNodes.forEach(c=>{if(c.nodeType===Node.ELEMENT_NODE){const i=c;(i.querySelector?.("#prompt-textarea")||i.querySelector?.("button.composer-btn")||i.querySelector?.('[role="dialog"]')||i.matches?.("#prompt-textarea")||i.id==="prompt-textarea")&&(r=!0)}})}),r&&(S=setTimeout(()=>{try{S=null,F(),K(),D()}catch(o){console.error("Error in ChatGPT observer callback:",o)}},300))});try{H.observe(document.body,{childList:!0,subtree:!0})}catch(t){console.error("Failed to set up ChatGPT route observer:",t),k&&clearInterval(k),k=setInterval(e,1e3)}}async function ee(n){try{const e=document.getElementById("prompt-textarea")?.textContent||"",r=document.querySelectorAll('[id*="sm-chatgpt-input-bar-element-before-composer"]')[0];if(!r){console.warn("ChatGPT icon element not found, cannot update feedback");return}L("Searching memories...",r);const o=new Promise((i,a)=>setTimeout(()=>a(new Error("Memory search timeout")),w.API_REQUEST_TIMEOUT)),c=await Promise.race([u.runtime.sendMessage({action:T.GET_RELATED_MEMORIES,data:e,actionSource:n}),o]);if(c?.success&&c?.data){const i=document.getElementById("prompt-textarea");i?(i.dataset.supermemories=`<div>Kortix memories of user (only for the reference): ${c.data}</div>`,console.log("Prompt element dataset:",i.dataset.supermemories),r.dataset.memoriesData=c.data,L("Included Memories",r)):(console.warn("ChatGPT prompt element not found after successful memory fetch"),L("Memories found",r))}else console.warn("No memories found or API response invalid"),L("No memories found",r)}catch(e){console.error("Error getting related memories:",e);try{const t=document.querySelectorAll('[id*="sm-chatgpt-input-bar-element-before-composer"]')[0];t&&L("Error fetching memories",t)}catch(t){console.error("Failed to update error feedback:",t)}}}function F(){const n=document.querySelectorAll('[role="dialog"]');let e=null;for(const c of n)if(c.querySelector("h2")?.textContent?.includes("Saved memories")){e=c;break}if(!e||e.querySelector("#kortix-save-button"))return;const t=e.querySelector(".mt-5.flex.justify-end");if(!t)return;const r=document.createElement("button");r.id="kortix-save-button",r.className="btn relative btn-primary-outline mr-2";const o=u.runtime.getURL("/icon-16.png");r.innerHTML=`
        <div class="flex items-center justify-center gap-2">
          <img src="${o}" alt="kortix" style="width: 16px; height: 16px; flex-shrink: 0; border-radius: 2px;" />
          Save to kortix
        </div>
      `,r.style.cssText=`
        background: #1C2026 !important;
        color: white !important;
        border: 1px solid #1C2026 !important;
        border-radius: 9999px !important;
        padding: 10px 16px !important;
        font-weight: 500 !important;
        font-size: 14px !important;
        margin-right: 8px !important;
        cursor: pointer !important;
      `,r.addEventListener("mouseenter",()=>{r.style.backgroundColor="#2B2E33"}),r.addEventListener("mouseleave",()=>{r.style.backgroundColor="#1C2026"}),r.addEventListener("click",async()=>{await he()}),t.insertBefore(r,t.firstChild)}async function he(){try{m.showToast("loading");const n=document.querySelector('[role="dialog"] table tbody');if(!n){m.showToast("error");return}const e=n.querySelectorAll("tr"),t=[];if(e.forEach(c=>{const i=c.querySelector("td .py-2.whitespace-pre-wrap");i?.textContent&&t.push(i.textContent.trim())}),console.log("Memories:",t),t.length===0){m.showToast("error");return}const r=`ChatGPT Saved Memories:

${t.map((c,i)=>`${i+1}. ${c}`).join(`

`)}`,o=await u.runtime.sendMessage({action:T.SAVE_MEMORY,data:{html:r},actionSource:"chatgpt_memories_dialog"});console.log({response:o}),o.success?m.showToast("success"):m.showToast("error")}catch(n){console.error("Error saving memories to kortix:",n),m.showToast("error")}}function L(n,e,t=0){e.dataset.originalHtml||(e.dataset.originalHtml=e.innerHTML);const r=document.createElement("div");if(r.style.cssText=`
		display: flex; 
		align-items: center; 
		gap: 6px; 
		padding: 4px 8px; 
		background: #513EA9; 
		border-radius: 12px; 
		color: white; 
		font-size: 12px; 
		font-weight: 500;
		cursor: ${n==="Included Memories"?"pointer":"default"};
		position: relative;
	`,r.innerHTML=`
		<span>✓</span>
		<span>${n}</span>
	`,n==="Included Memories"&&e.dataset.memoriesData){const o=document.createElement("div");o.style.cssText=`
			position: fixed;
			bottom: 80px;
			left: 50%;
			transform: translateX(-50%);
			background: #1a1a1a;
			color: white;
			padding: 0;
			border-radius: 12px;
			font-size: 13px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
			max-width: 500px;
			max-height: 400px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
			z-index: 999999;
			display: none;
			border: 1px solid #333;
		`;const c=document.createElement("div");c.style.cssText=`
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 8px;
			border-bottom: 1px solid #333;
			opacity: 0.8;
		`,c.innerHTML=`
			<span style="font-weight: 600; color: #fff;">Included Memories</span>
		`;const i=document.createElement("div");i.style.cssText=`
			padding: 0;
			max-height: 300px;
			overflow-y: auto;
		`;const a=e.dataset.memoriesData||"";console.log("Memories text:",a);const l=a.split(/[,\n]/).map(s=>s.trim()).filter(s=>s.length>0&&s!==",");console.log("Individual memories:",l),l.forEach((s,g)=>{const p=document.createElement("div");p.style.cssText=`
				display: flex;
				align-items: center;
				gap: 6px;
				padding: 10px;
				font-size: 13px;
				line-height: 1.4;
			`;const f=document.createElement("div");f.style.cssText=`
				flex: 1;
				color: #e5e5e5;
			`,f.textContent=s.trim();const d=document.createElement("button");d.style.cssText=`
				background: transparent;
				color: #9ca3af;
				border: none;
				padding: 4px;
				border-radius: 4px;
				cursor: pointer;
				flex-shrink: 0;
				height: fit-content;
				display: flex;
				align-items: center;
				justify-content: center;
			`,d.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',d.dataset.memoryIndex=g.toString(),d.addEventListener("mouseenter",()=>{d.style.color="#ef4444"}),d.addEventListener("mouseleave",()=>{d.style.color="#9ca3af"}),p.appendChild(f),p.appendChild(d),i.appendChild(p)}),o.appendChild(c),o.appendChild(i),document.body.appendChild(o),r.addEventListener("mouseenter",()=>{const s=r.querySelector("span:last-child");s&&(s.textContent="Click to see memories")}),r.addEventListener("mouseleave",()=>{const s=r.querySelector("span:last-child");s&&(s.textContent="Included Memories")}),r.addEventListener("click",s=>{s.stopPropagation(),o.style.display="block"}),document.addEventListener("click",s=>{o.contains(s.target)||(o.style.display="none")}),i.querySelectorAll("button[data-memory-index]").forEach(s=>{const g=s;g.addEventListener("click",()=>{const p=Number.parseInt(g.dataset.memoryIndex||"0",10),f=g.parentElement;f&&i.removeChild(f);const d=(e.dataset.memoriesData||"").split(/[,\n]/).map(h=>h.trim()).filter(h=>h.length>0&&h!==",");d.splice(p,1);const v=d.join(" ,");e.dataset.memoriesData=v;const x=document.getElementById("prompt-textarea");x&&(x.dataset.supermemories=`<div>Kortix memories of user (only for the reference): ${v}</div>`),i.querySelectorAll("button[data-memory-index]").forEach((h,O)=>{const P=h;P.dataset.memoryIndex=O.toString()}),d.length<=1&&(x?.dataset.supermemories&&(delete x.dataset.supermemories,delete e.dataset.memoriesData,e.innerHTML=e.dataset.originalHtml||"",delete e.dataset.originalHtml),o.style.display="none",document.body.contains(o)&&document.body.removeChild(o))})}),setTimeout(()=>{document.body.contains(o)&&document.body.removeChild(o)},3e5)}e.innerHTML="",e.appendChild(r),t>0&&setTimeout(()=>{e.innerHTML=e.dataset.originalHtml||"",delete e.dataset.originalHtml},t)}function K(){document.querySelectorAll("button.composer-btn").forEach(e=>{if(e.hasAttribute("data-kortix-icon-added-before"))return;const t=e.parentElement;if(!t)return;const r=t.parentElement?.children;if(!r)return;let o=!1;for(const l of r)if(l.getAttribute("data-testid")==="composer-speech-button-container"){o=!0;break}if(!o)return;const c=t.parentElement;if(!c)return;if(c.querySelector(`#${y.CHATGPT_INPUT_BAR_ELEMENT}-before-composer`)){e.setAttribute("data-kortix-icon-added-before","true");return}const a=me(async()=>{await ee("chatgpt_chat_memories_searched")});a.id=`${y.CHATGPT_INPUT_BAR_ELEMENT}-before-composer-${Date.now()}-${Math.random().toString(36).substring(2,11)}`,e.setAttribute("data-kortix-icon-added-before","true"),c.insertBefore(a,t),D()})}async function D(){if(!((await chrome.storage.local.get([b.AUTO_SEARCH_ENABLED]))[b.AUTO_SEARCH_ENABLED]??!1))return;const t=document.getElementById("prompt-textarea");if(!t||t.hasAttribute("data-kortix-auto-fetch"))return;t.setAttribute("data-kortix-auto-fetch","true");const r=()=>{G&&clearTimeout(G),G=setTimeout(async()=>{const o=t.textContent?.trim()||"";o.length>2?await ee("chatgpt_chat_memories_auto_searched"):o.length===0&&(document.querySelectorAll('[id*="sm-chatgpt-input-bar-element-before-composer"]').forEach(i=>{const a=i;a.dataset.originalHtml&&(a.innerHTML=a.dataset.originalHtml,delete a.dataset.originalHtml,delete a.dataset.memoriesData)}),t.dataset.supermemories&&delete t.dataset.supermemories)},w.AUTO_SEARCH_DEBOUNCE_DELAY)};t.addEventListener("input",r)}function ge(){if(document.body.hasAttribute("data-chatgpt-prompt-capture-setup"))return;document.body.setAttribute("data-chatgpt-prompt-capture-setup","true");const n=async e=>{const t=document.getElementById("prompt-textarea");let r="";t&&(r=t.textContent||"");const o=t?.dataset.supermemories;if(o&&t&&!r.includes("Kortix memories of user")&&(t.innerHTML=`${t.innerHTML} ${o}`,r=t.textContent||""),t&&r.trim()){console.log(`ChatGPT prompt submitted via ${e}:`,r);try{await u.runtime.sendMessage({action:T.CAPTURE_PROMPT,data:{prompt:r,platform:"chatgpt",source:e}})}catch(i){console.error("Error sending ChatGPT prompt to background:",i)}}document.querySelectorAll('[id*="sm-chatgpt-input-bar-element-before-composer"]').forEach(i=>{const a=i;a.dataset.originalHtml&&(a.innerHTML=a.dataset.originalHtml,delete a.dataset.originalHtml,delete a.dataset.memoriesData)}),t?.dataset.supermemories&&delete t.dataset.supermemories};document.addEventListener("click",async e=>{const t=e.target;(t.id==="composer-submit-button"||t.closest("#composer-submit-button"))&&await n("button click")},!0),document.addEventListener("keydown",async e=>{e.target.id==="prompt-textarea"&&e.key==="Enter"&&!e.shiftKey&&await n("Enter key")},!0)}let z=null,U=null,C=null,M=null;function te(){m.isOnDomain(E.CLAUDE)&&(document.body.hasAttribute("data-claude-initialized")||(setTimeout(()=>{j(),W()},2e3),Te(),ye(),document.body.setAttribute("data-claude-initialized","true")))}function ye(){U&&U.disconnect(),C&&clearInterval(C),M&&(clearTimeout(M),M=null);let n=window.location.href;const e=()=>{window.location.href!==n&&(n=window.location.href,console.log("Claude route changed, re-adding kortix icon"),setTimeout(()=>{j(),W()},1e3))};C=setInterval(e,2e3),U=new MutationObserver(t=>{if(M)return;let r=!1;t.forEach(o=>{o.type==="childList"&&o.addedNodes.length>0&&o.addedNodes.forEach(c=>{if(c.nodeType===Node.ELEMENT_NODE){const i=c;(i.querySelector?.('div[contenteditable="true"]')||i.querySelector?.("textarea")||i.matches?.('div[contenteditable="true"]')||i.matches?.("textarea"))&&(r=!0)}})}),r&&(M=setTimeout(()=>{try{M=null,j(),W()}catch(o){console.error("Error in Claude observer callback:",o)}},300))});try{U.observe(document.body,{childList:!0,subtree:!0})}catch(t){console.error("Failed to set up Claude route observer:",t),C&&clearInterval(C),C=setInterval(e,1e3)}}function j(){document.querySelectorAll(".relative.flex-1.flex.items-center.gap-2.shrink.min-w-0").forEach(e=>{if(e.hasAttribute("data-kortix-icon-added"))return;if(e.querySelector(`#${y.CLAUDE_INPUT_BAR_ELEMENT}`)){e.setAttribute("data-kortix-icon-added","true");return}const r=ue(async()=>{await oe("claude_chat_memories_searched")});r.id=`${y.CLAUDE_INPUT_BAR_ELEMENT}-${Date.now()}-${Math.random().toString(36).substring(2,11)}`,e.setAttribute("data-kortix-icon-added","true"),e.insertBefore(r,e.firstChild)})}async function oe(n){try{let e="";const t=document.querySelector('[data-kortix-icon-added="true"]');if(t?.parentElement?.previousElementSibling){const a=t.parentElement.previousElementSibling.querySelector("p");e=a?.innerText||a?.textContent||""}if(!e.trim()){const a=document.querySelector('div[contenteditable="true"]');e=a?.innerText||a?.textContent||""}if(!e.trim()){const a=document.querySelectorAll('div[contenteditable="true"], textarea, input[type="text"]');for(const l of a){const s=l.innerText||l.value;if(s?.trim()){e=s.trim();break}}}if(console.log("Claude query extracted:",e),!e.trim()){console.log("No query text found for Claude");return}const o=document.querySelector('[id*="sm-claude-input-bar-element"]');if(!o){console.warn("Claude icon element not found, cannot update feedback");return}_("Searching memories...",o);const c=new Promise((a,l)=>setTimeout(()=>l(new Error("Memory search timeout")),w.API_REQUEST_TIMEOUT)),i=await Promise.race([u.runtime.sendMessage({action:T.GET_RELATED_MEMORIES,data:e,actionSource:n}),c]);if(console.log("Claude memories response:",i),i?.success&&i?.data){const a=document.querySelector('div[contenteditable="true"]');a?(a.dataset.supermemories=`<div>Kortix memories of user (only for the reference): ${i.data}</div>`,console.log("Text element dataset:",a.dataset.supermemories),o.dataset.memoriesData=i.data,_("Included Memories",o)):(console.warn("Claude input area not found after successful memory fetch"),_("Memories found",o))}else console.warn("No memories found or API response invalid for Claude"),_("No memories found",o)}catch(e){console.error("Error getting related memories for Claude:",e);try{const t=document.querySelector('[id*="sm-claude-input-bar-element"]');t&&_("Error fetching memories",t)}catch(t){console.error("Failed to update Claude error feedback:",t)}}}function _(n,e,t=0){e.dataset.originalHtml||(e.dataset.originalHtml=e.innerHTML);const r=document.createElement("div");if(r.style.cssText=`
		display: flex; 
		align-items: center; 
		gap: 6px; 
		padding: 6px 8px; 
		background: #513EA9; 
		border-radius: 6px; 
		color: white; 
		font-size: 12px; 
		font-weight: 500;
		cursor: ${n==="Included Memories"?"pointer":"default"};
		position: relative;
	`,r.innerHTML=`
		<span>✓</span>
		<span>${n}</span>
	`,n==="Included Memories"&&e.dataset.memoriesData){const o=document.createElement("div");o.style.cssText=`
			position: fixed;
			bottom: 80px;
			left: 50%;
			transform: translateX(-50%);
			background: #1a1a1a;
			color: white;
			padding: 0;
			border-radius: 12px;
			font-size: 13px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
			max-width: 500px;
			max-height: 400px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
			z-index: 999999;
			display: none;
			border: 1px solid #333;
		`;const c=document.createElement("div");c.style.cssText=`
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 8px;
			border-bottom: 1px solid #333;
			opacity: 0.8;
		`,c.innerHTML=`
			<span style="font-weight: 600; color: #fff;">Included Memories</span>
		`;const i=document.createElement("div");i.style.cssText=`
			padding: 0;
			max-height: 300px;
			overflow-y: auto;
		`;const a=e.dataset.memoriesData||"";console.log("Memories text:",a);const l=a.split(/[,\n]/).map(s=>s.trim()).filter(s=>s.length>0&&s!==",");console.log("Individual memories:",l),l.forEach((s,g)=>{const p=document.createElement("div");p.style.cssText=`
				display: flex;
				align-items: center;
				gap: 6px;
				padding: 10px;
				font-size: 13px;
				line-height: 1.4;
			`;const f=document.createElement("div");f.style.cssText=`
				flex: 1;
				color: #e5e5e5;
			`,f.textContent=s.trim();const d=document.createElement("button");d.style.cssText=`
				background: transparent;
				color: #9ca3af;
				border: none;
				padding: 4px;
				border-radius: 4px;
				cursor: pointer;
				flex-shrink: 0;
				height: fit-content;
				display: flex;
				align-items: center;
				justify-content: center;
			`,d.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',d.dataset.memoryIndex=g.toString(),d.addEventListener("mouseenter",()=>{d.style.color="#ef4444"}),d.addEventListener("mouseleave",()=>{d.style.color="#9ca3af"}),p.appendChild(f),p.appendChild(d),i.appendChild(p)}),o.appendChild(c),o.appendChild(i),document.body.appendChild(o),r.addEventListener("mouseenter",()=>{const s=r.querySelector("span:last-child");s&&(s.textContent="Click to see memories")}),r.addEventListener("mouseleave",()=>{const s=r.querySelector("span:last-child");s&&(s.textContent="Included Memories")}),r.addEventListener("click",s=>{s.stopPropagation(),o.style.display="block"}),document.addEventListener("click",s=>{o.contains(s.target)||(o.style.display="none")}),i.querySelectorAll("button[data-memory-index]").forEach(s=>{const g=s;g.addEventListener("click",()=>{const p=Number.parseInt(g.dataset.memoryIndex||"0",10),f=g.parentElement;f&&i.removeChild(f);const d=(e.dataset.memoriesData||"").split(/[,\n]/).map(h=>h.trim()).filter(h=>h.length>0&&h!==",");d.splice(p,1);const v=d.join(" ,");e.dataset.memoriesData=v;const x=document.querySelector('div[contenteditable="true"]');x&&(x.dataset.supermemories=`<div>Kortix memories of user (only for the reference): ${v}</div>`),i.querySelectorAll("button[data-memory-index]").forEach((h,O)=>{const P=h;P.dataset.memoryIndex=O.toString()}),d.length<=1&&(x?.dataset.supermemories&&(delete x.dataset.supermemories,delete e.dataset.memoriesData,e.innerHTML=e.dataset.originalHtml||"",delete e.dataset.originalHtml),o.style.display="none",document.body.contains(o)&&document.body.removeChild(o))})}),setTimeout(()=>{document.body.contains(o)&&document.body.removeChild(o)},3e5)}e.innerHTML="",e.appendChild(r),t>0&&setTimeout(()=>{e.innerHTML=e.dataset.originalHtml||"",delete e.dataset.originalHtml},t)}function Te(){if(document.body.hasAttribute("data-claude-prompt-capture-setup"))return;document.body.setAttribute("data-claude-prompt-capture-setup","true");const n=async e=>{let t="";const r=document.querySelector('div[contenteditable="true"]');if(r&&(t=r.textContent||r.innerText||""),!t){const i=document.querySelector("textarea");i&&(t=i.value||"")}const o=r?.dataset.supermemories;if(o&&r&&!t.includes("Kortix memories of user")&&(r.innerHTML=`${r.innerHTML} ${o}`,t=r.textContent||r.innerText||""),t.trim()){console.log(`Claude prompt submitted via ${e}:`,t);try{await u.runtime.sendMessage({action:T.CAPTURE_PROMPT,data:{prompt:t,platform:"claude",source:e}})}catch(i){console.error("Error sending Claude prompt to background:",i)}}document.querySelectorAll('[id*="sm-claude-input-bar-element"]').forEach(i=>{const a=i;a.dataset.originalHtml&&(a.innerHTML=a.dataset.originalHtml,delete a.dataset.originalHtml,delete a.dataset.memoriesData)}),r?.dataset.supermemories&&delete r.dataset.supermemories};document.addEventListener("click",async e=>{const t=e.target;(t.closest("button.inline-flex.items-center.justify-center.relative.shrink-0.can-focus.select-none")||t.closest('button[class*="bg-accent-main-000"]')||t.closest('button[class*="rounded-lg"]'))&&await n("button click")},!0),document.addEventListener("keydown",async e=>{const t=e.target;(t.matches('div[contenteditable="true"]')||t.matches(".ProseMirror")||t.matches("textarea")||t.closest(".ProseMirror"))&&e.key==="Enter"&&!e.shiftKey&&await n("Enter key")},!0)}async function W(){if(!((await chrome.storage.local.get([b.AUTO_SEARCH_ENABLED]))[b.AUTO_SEARCH_ENABLED]??!1))return;const t=document.querySelector('div[contenteditable="true"]');if(!t||t.hasAttribute("data-kortix-auto-fetch"))return;t.setAttribute("data-kortix-auto-fetch","true");const r=()=>{z&&clearTimeout(z),z=setTimeout(async()=>{const o=t.textContent?.trim()||"";o.length>2?await oe("claude_chat_memories_auto_searched"):o.length===0&&(document.querySelectorAll('[id*="sm-claude-input-bar-element"]').forEach(i=>{const a=i;a.dataset.originalHtml&&(a.innerHTML=a.dataset.originalHtml,delete a.dataset.originalHtml,delete a.dataset.memoriesData)}),t.dataset.supermemories&&delete t.dataset.supermemories)},w.AUTO_SEARCH_DEBOUNCE_DELAY)};t.addEventListener("input",r)}async function re(){try{m.showToast("loading");const n=window.getSelection()?.toString()||"",e=window.location.href,t=document.documentElement.outerHTML,r=await u.runtime.sendMessage({action:T.SAVE_MEMORY,data:{html:t,highlightedText:n,url:e},actionSource:"context_menu"});console.log("Response from enxtension:",r),r.success?m.showToast("success"):m.showToast("error")}catch(n){console.error("Error saving memory:",n),m.showToast("error")}}function xe(){document.addEventListener("keydown",async n=>{(n.ctrlKey||n.metaKey)&&n.shiftKey&&n.key==="m"&&(n.preventDefault(),await re())})}function Ee(){window.addEventListener("message",n=>{if(!n.data||typeof n.data!="object")return;const e=n.data.token,t=n.data.refreshToken,r=n.data.userData;if(e&&r){if(!E.KORTIX.includes(window.location.hostname))return;chrome.storage.local.set({[b.BEARER_TOKEN]:e,[b.USER_DATA]:r,...t&&{[b.REFRESH_TOKEN]:t}},()=>{})}})}let X=null,N=null,I=null,A=null;function ne(){m.isOnDomain(E.T3)&&(document.body.hasAttribute("data-t3-initialized")||(setTimeout(()=>{console.log("Adding kortix icon to T3 input"),Y(),V()},2e3),ve(),be(),document.body.setAttribute("data-t3-initialized","true")))}function be(){N&&N.disconnect(),I&&clearInterval(I),A&&(clearTimeout(A),A=null);let n=window.location.href;const e=()=>{window.location.href!==n&&(n=window.location.href,console.log("T3 route changed, re-adding kortix icon"),setTimeout(()=>{Y(),V()},1e3))};I=setInterval(e,2e3),N=new MutationObserver(t=>{if(A)return;let r=!1;t.forEach(o=>{o.type==="childList"&&o.addedNodes.length>0&&o.addedNodes.forEach(c=>{if(c.nodeType===Node.ELEMENT_NODE){const i=c;(i.querySelector?.("textarea")||i.querySelector?.('div[contenteditable="true"]')||i.matches?.("textarea")||i.matches?.('div[contenteditable="true"]'))&&(r=!0)}})}),r&&(A=setTimeout(()=>{try{A=null,Y(),V()}catch(o){console.error("Error in T3 observer callback:",o)}},300))});try{N.observe(document.body,{childList:!0,subtree:!0})}catch(t){console.error("Failed to set up T3 route observer:",t),I&&clearInterval(I),I=setInterval(e,1e3)}}function Y(){document.querySelectorAll(".flex.min-w-0.items-center.gap-2.overflow-hidden").forEach(e=>{if(e.hasAttribute("data-kortix-icon-added"))return;if(e.querySelector(`#${y.T3_INPUT_BAR_ELEMENT}`)){e.setAttribute("data-kortix-icon-added","true");return}const r=pe(async()=>{await ie("t3_chat_memories_searched")});r.id=`${y.T3_INPUT_BAR_ELEMENT}-${Date.now()}-${Math.random().toString(36).substring(2,11)}`,e.setAttribute("data-kortix-icon-added","true"),e.insertBefore(r,e.firstChild)})}async function ie(n){try{let e="";const t=document.querySelector('[data-kortix-icon-added="true"]');if(t?.parentElement?.parentElement?.previousElementSibling&&(e=t.parentElement.parentElement.previousElementSibling.querySelector("textarea")?.value||""),!e.trim()){const a=document.querySelector('div[contenteditable="true"]');e=a?.innerText||a?.textContent||""}if(!e.trim()){const a=document.querySelectorAll("textarea");for(const l of a){const s=l.value;if(s?.trim()){e=s.trim();break}}}if(console.log("T3 query extracted:",e),!e.trim()){console.log("No query text found for T3");return}const o=document.querySelector('[id*="sm-t3-input-bar-element"]');if(!o){console.warn("T3 icon element not found, cannot update feedback");return}R("Searching memories...",o);const c=new Promise((a,l)=>setTimeout(()=>l(new Error("Memory search timeout")),w.API_REQUEST_TIMEOUT)),i=await Promise.race([u.runtime.sendMessage({action:T.GET_RELATED_MEMORIES,data:e,actionSource:n}),c]);if(console.log("T3 memories response:",i),i?.success&&i?.data){let a=null;const l=document.querySelector('[data-kortix-icon-added="true"]');l?.parentElement?.parentElement?.previousElementSibling&&(a=l.parentElement.parentElement.previousElementSibling.querySelector("textarea")),a||(a=document.querySelector('div[contenteditable="true"]')),a?(a.tagName==="TEXTAREA"?a.dataset.supermemories=`<br>Kortix memories of user (only for the reference): ${i.data}</br>`:a.dataset.supermemories=`<br>Kortix memories of user (only for the reference): ${i.data}</br>`,o.dataset.memoriesData=i.data,R("Included Memories",o)):(console.warn("T3 input area not found after successful memory fetch"),R("Memories found",o))}else console.warn("No memories found or API response invalid for T3"),R("No memories found",o)}catch(e){console.error("Error getting related memories for T3:",e);try{const t=document.querySelector('[id*="sm-t3-input-bar-element"]');t&&R("Error fetching memories",t)}catch(t){console.error("Failed to update T3 error feedback:",t)}}}function R(n,e,t=0){e.dataset.originalHtml||(e.dataset.originalHtml=e.innerHTML);const r=document.createElement("div");if(r.style.cssText=`
		display: flex; 
		align-items: center; 
		gap: 6px; 
		padding: 6px 8px; 
		background: #513EA9; 
		border-radius: 6px; 
		color: white; 
		font-size: 12px; 
		font-weight: 500;
		cursor: ${n==="Included Memories"?"pointer":"default"};
		position: relative;
	`,r.innerHTML=`
		<span>✓</span>
		<span>${n}</span>
	`,n==="Included Memories"&&e.dataset.memoriesData){const o=document.createElement("div");o.style.cssText=`
			position: fixed;
			bottom: 80px;
			left: 50%;
			transform: translateX(-50%);
			background: #1a1a1a;
			color: white;
			padding: 0;
			border-radius: 12px;
			font-size: 13px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
			max-width: 500px;
			max-height: 400px;
			box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
			z-index: 999999;
			display: none;
			border: 1px solid #333;
		`;const c=document.createElement("div");c.style.cssText=`
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 8px;
			border-bottom: 1px solid #333;
			opacity: 0.8;
		`,c.innerHTML=`
			<span style="font-weight: 600; color: #fff;">Included Memories</span>
		`;const i=document.createElement("div");i.style.cssText=`
			padding: 0;
			max-height: 300px;
			overflow-y: auto;
		`;const a=e.dataset.memoriesData||"";console.log("Memories text:",a);const l=a.split(/[,\n]/).map(s=>s.trim()).filter(s=>s.length>0&&s!==",");console.log("Individual memories:",l),l.forEach((s,g)=>{const p=document.createElement("div");p.style.cssText=`
				display: flex;
				align-items: center;
				gap: 6px;
				padding: 10px;
				font-size: 13px;
				line-height: 1.4;
			`;const f=document.createElement("div");f.style.cssText=`
				flex: 1;
				color: #e5e5e5;
			`,f.textContent=s.trim();const d=document.createElement("button");d.style.cssText=`
				background: transparent;
				color: #9ca3af;
				border: none;
				padding: 4px;
				border-radius: 4px;
				cursor: pointer;
				flex-shrink: 0;
				height: fit-content;
				display: flex;
				align-items: center;
				justify-content: center;
			`,d.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',d.dataset.memoryIndex=g.toString(),d.addEventListener("mouseenter",()=>{d.style.color="#ef4444"}),d.addEventListener("mouseleave",()=>{d.style.color="#9ca3af"}),p.appendChild(f),p.appendChild(d),i.appendChild(p)}),o.appendChild(c),o.appendChild(i),document.body.appendChild(o),r.addEventListener("mouseenter",()=>{const s=r.querySelector("span:last-child");s&&(s.textContent="Click to see memories")}),r.addEventListener("mouseleave",()=>{const s=r.querySelector("span:last-child");s&&(s.textContent="Included Memories")}),r.addEventListener("click",s=>{s.stopPropagation(),o.style.display="block"}),document.addEventListener("click",s=>{o.contains(s.target)||(o.style.display="none")}),i.querySelectorAll("button[data-memory-index]").forEach(s=>{const g=s;g.addEventListener("click",()=>{const p=Number.parseInt(g.dataset.memoryIndex||"0",10),f=g.parentElement;f&&i.removeChild(f);const d=(e.dataset.memoriesData||"").split(/[,\n]/).map(h=>h.trim()).filter(h=>h.length>0&&h!==",");d.splice(p,1);const v=d.join(" ,");e.dataset.memoriesData=v;const x=document.querySelector("textarea")||document.querySelector('div[contenteditable="true"]');x&&(x.dataset.supermemories=`<div>Kortix memories of user (only for the reference): ${v}</div>`),i.querySelectorAll("button[data-memory-index]").forEach((h,O)=>{const P=h;P.dataset.memoryIndex=O.toString()}),d.length<=1&&(x?.dataset.supermemories&&(delete x.dataset.supermemories,delete e.dataset.memoriesData,e.innerHTML=e.dataset.originalHtml||"",delete e.dataset.originalHtml),o.style.display="none",document.body.contains(o)&&document.body.removeChild(o))})}),setTimeout(()=>{document.body.contains(o)&&document.body.removeChild(o)},3e5)}e.innerHTML="",e.appendChild(r),t>0&&setTimeout(()=>{e.innerHTML=e.dataset.originalHtml||"",delete e.dataset.originalHtml},t)}function ve(){if(document.body.hasAttribute("data-t3-prompt-capture-setup"))return;document.body.setAttribute("data-t3-prompt-capture-setup","true");const n=async e=>{let t="";const r=document.querySelector("textarea");if(r&&(t=r.value||""),!t){const a=document.querySelector('div[contenteditable="true"]');a&&(t=a.textContent||a.innerText||"")}const o=r||document.querySelector('div[contenteditable="true"]'),c=o?.dataset.supermemories;if(c&&o&&!t.includes("Kortix memories of user")&&(o.tagName==="TEXTAREA"?(o.value=`${t} ${c}`,t=o.value):(o.innerHTML=`${o.innerHTML} ${c}`,t=o.textContent||o.innerText||"")),t.trim()){console.log(`T3 prompt submitted via ${e}:`,t);try{await u.runtime.sendMessage({action:T.CAPTURE_PROMPT,data:{prompt:t,platform:"t3",source:e}})}catch(a){console.error("Error sending T3 prompt to background:",a)}}document.querySelectorAll('[id*="sm-t3-input-bar-element"]').forEach(a=>{const l=a;l.dataset.originalHtml&&(l.innerHTML=l.dataset.originalHtml,delete l.dataset.originalHtml,delete l.dataset.memoriesData)}),o?.dataset.supermemories&&delete o.dataset.supermemories};document.addEventListener("click",async e=>{const t=e.target;(t.closest("button.focus-visible\\:ring-ring")||t.closest('button[class*="bg-[rgb(162,59,103)]"]')||t.closest('button[class*="rounded-lg"]'))&&await n("button click")},!0),document.addEventListener("keydown",async e=>{const t=e.target;if((t.matches("textarea")||t.matches('div[contenteditable="true"]'))&&e.key==="Enter"&&!e.shiftKey)if(t.matches("textarea")){const r=t.value||"";if(r.trim()){console.log("T3 prompt submitted via Enter key:",r);try{await u.runtime.sendMessage({action:T.CAPTURE_PROMPT,data:{prompt:r,platform:"t3",source:"Enter key"},actionSource:"t3"})}catch(o){console.error("Error sending T3 textarea prompt to background:",o)}}}else await n("Enter key")},!0)}async function V(){if(!((await chrome.storage.local.get([b.AUTO_SEARCH_ENABLED]))[b.AUTO_SEARCH_ENABLED]??!1))return;const t=document.querySelector("textarea")||document.querySelector('div[contenteditable="true"]');if(!t||t.hasAttribute("data-kortix-auto-fetch"))return;t.setAttribute("data-kortix-auto-fetch","true");const r=()=>{X&&clearTimeout(X),X=setTimeout(async()=>{let o="";t.tagName==="TEXTAREA"?o=t.value?.trim()||"":o=t.textContent?.trim()||"",o.length>2?await ie("t3_chat_memories_auto_searched"):o.length===0&&(document.querySelectorAll('[id*="sm-t3-input-bar-element"]').forEach(i=>{const a=i;a.dataset.originalHtml&&(a.innerHTML=a.dataset.originalHtml,delete a.dataset.originalHtml,delete a.dataset.memoriesData)}),t.dataset.supermemories&&delete t.dataset.supermemories)},w.AUTO_SEARCH_DEBOUNCE_DELAY)};t.addEventListener("input",r)}function we(){m.isOnDomain(E.TWITTER)&&(window.location.pathname==="/i/bookmarks"?setTimeout(()=>{ae()},2e3):m.elementExists(y.TWITTER_IMPORT_BUTTON)&&m.removeElement(y.TWITTER_IMPORT_BUTTON))}function ae(){if(window.location.pathname!=="/i/bookmarks"||m.elementExists(y.TWITTER_IMPORT_BUTTON))return;const n=le(async()=>{try{await u.runtime.sendMessage({type:T.BATCH_IMPORT_ALL})}catch(e){console.error("Error starting import:",e)}});document.body.appendChild(n)}function se(n){const e=document.getElementById(y.TWITTER_IMPORT_BUTTON);if(!e)return;const t=u.runtime.getURL("/icon-16.png");n.type===T.IMPORT_UPDATE&&(e.innerHTML=`
			<img src="${t}" width="20" height="20" alt="Save to Memory" style="border-radius: 4px;" />
			<span style="font-weight: 500; font-size: 14px;">${n.importedMessage}</span>
		`,e.style.cursor="default"),n.type===T.IMPORT_DONE&&(e.innerHTML=`
			<img src="${t}" width="20" height="20" alt="Save to Memory" style="border-radius: 4px;" />
			<span style="font-weight: 500; font-size: 14px; color: #059669;">✓ Imported ${n.totalImported} tweets!</span>
		`,setTimeout(()=>{e.innerHTML=`
				<img src="${t}" width="20" height="20" alt="Save to Memory" style="border-radius: 4px;" />
				<span style="font-weight: 500; font-size: 14px;">Import Bookmarks</span>
			`,e.style.cursor="pointer"},3e3))}function ke(){m.isOnDomain(E.TWITTER)&&(window.location.pathname==="/i/bookmarks"?ae():m.elementExists(y.TWITTER_IMPORT_BUTTON)&&m.removeElement(y.TWITTER_IMPORT_BUTTON))}const Se={matches:["<all_urls>"],main(){u.runtime.onMessage.addListener(async e=>{e.action===T.SHOW_TOAST?m.showToast(e.state):e.action===T.SAVE_MEMORY?await re():(e.type===T.IMPORT_UPDATE||e.type===T.IMPORT_DONE)&&se(e)}),xe(),Ee();const n=()=>{new MutationObserver(()=>{m.isOnDomain(E.CHATGPT)&&Z(),m.isOnDomain(E.CLAUDE)&&te(),m.isOnDomain(E.T3)&&ne(),m.isOnDomain(E.TWITTER)&&ke()}).observe(document.body,{childList:!0,subtree:!0})};Z(),te(),ne(),we(),document.readyState==="loading"?document.addEventListener("DOMContentLoaded",n):n()}};function B(n,...e){}const Ce={debug:(...n)=>B(console.debug,...n),log:(...n)=>B(console.log,...n),warn:(...n)=>B(console.warn,...n),error:(...n)=>B(console.error,...n)};class Q extends Event{constructor(e,t){super(Q.EVENT_NAME,{}),this.newUrl=e,this.oldUrl=t}static EVENT_NAME=J("wxt:locationchange")}function J(n){return`${u?.runtime?.id}:content:${n}`}function Me(n){let e,t;return{run(){e==null&&(t=new URL(location.href),e=n.setInterval(()=>{let r=new URL(location.href);r.href!==t.href&&(window.dispatchEvent(new Q(r,t)),t=r)},1e3))}}}class q{constructor(e,t){this.contentScriptName=e,this.options=t,this.abortController=new AbortController,this.isTopFrame?(this.listenForNewerScripts({ignoreFirstEvent:!0}),this.stopOldScripts()):this.listenForNewerScripts()}static SCRIPT_STARTED_MESSAGE_TYPE=J("wxt:content-script-started");isTopFrame=window.self===window.top;abortController;locationWatcher=Me(this);receivedMessageIds=new Set;get signal(){return this.abortController.signal}abort(e){return this.abortController.abort(e)}get isInvalid(){return u.runtime.id==null&&this.notifyInvalidated(),this.signal.aborted}get isValid(){return!this.isInvalid}onInvalidated(e){return this.signal.addEventListener("abort",e),()=>this.signal.removeEventListener("abort",e)}block(){return new Promise(()=>{})}setInterval(e,t){const r=setInterval(()=>{this.isValid&&e()},t);return this.onInvalidated(()=>clearInterval(r)),r}setTimeout(e,t){const r=setTimeout(()=>{this.isValid&&e()},t);return this.onInvalidated(()=>clearTimeout(r)),r}requestAnimationFrame(e){const t=requestAnimationFrame((...r)=>{this.isValid&&e(...r)});return this.onInvalidated(()=>cancelAnimationFrame(t)),t}requestIdleCallback(e,t){const r=requestIdleCallback((...o)=>{this.signal.aborted||e(...o)},t);return this.onInvalidated(()=>cancelIdleCallback(r)),r}addEventListener(e,t,r,o){t==="wxt:locationchange"&&this.isValid&&this.locationWatcher.run(),e.addEventListener?.(t.startsWith("wxt:")?J(t):t,r,{...o,signal:this.signal})}notifyInvalidated(){this.abort("Content script context invalidated"),Ce.debug(`Content script "${this.contentScriptName}" context invalidated`)}stopOldScripts(){window.postMessage({type:q.SCRIPT_STARTED_MESSAGE_TYPE,contentScriptName:this.contentScriptName,messageId:Math.random().toString(36).slice(2)},"*")}verifyScriptStartedEvent(e){const t=e.data?.type===q.SCRIPT_STARTED_MESSAGE_TYPE,r=e.data?.contentScriptName===this.contentScriptName,o=!this.receivedMessageIds.has(e.data?.messageId);return t&&r&&o}listenForNewerScripts(e){let t=!0;const r=o=>{if(this.verifyScriptStartedEvent(o)){this.receivedMessageIds.add(o.data.messageId);const c=t;if(t=!1,c&&e?.ignoreFirstEvent)return;this.notifyInvalidated()}};addEventListener("message",r),this.onInvalidated(()=>removeEventListener("message",r))}}function Re(){}function $(n,...e){}const Ie={debug:(...n)=>$(console.debug,...n),log:(...n)=>$(console.log,...n),warn:(...n)=>$(console.warn,...n),error:(...n)=>$(console.error,...n)};return(async()=>{try{const{main:n,...e}=Se,t=new q("content",e);return await n(t)}catch(n){throw Ie.error('The content script "content" crashed on startup!',n),n}})()})();
content;