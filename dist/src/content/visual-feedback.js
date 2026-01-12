(function(){"use strict";class h{constructor(){this.enabled=!0,this.highlightedLinks=new Map,this.styleSheet=null,this._injectStyles(),this._loadSettings()}_injectStyles(){this.styleSheet=document.createElement("style"),this.styleSheet.textContent=`
      .instantnav-ghost-highlight {
        position: absolute;
        pointer-events: none;
        border-radius: 4px;
        background: linear-gradient(135deg, 
          rgba(99, 102, 241, 0.08) 0%, 
          rgba(168, 85, 247, 0.08) 100%);
        box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.1);
        transition: opacity 0.2s ease-out, transform 0.15s ease-out;
        z-index: 9998;
      }
      
      .instantnav-ghost-highlight.score-high {
        background: linear-gradient(135deg, 
          rgba(34, 197, 94, 0.1) 0%, 
          rgba(16, 185, 129, 0.1) 100%);
        box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.15);
      }
      
      .instantnav-ghost-highlight.score-max {
        background: linear-gradient(135deg, 
          rgba(251, 191, 36, 0.12) 0%, 
          rgba(245, 158, 11, 0.12) 100%);
        box-shadow: 0 0 0 1px rgba(251, 191, 36, 0.2);
        animation: instantnav-pulse 1.5s ease-in-out infinite;
      }
      
      @keyframes instantnav-pulse {
        0%, 100% { opacity: 0.7; }
        50% { opacity: 1; }
      }
    `,document.head.appendChild(this.styleSheet)}async _loadSettings(){try{const t=await chrome.storage.local.get("visualFeedback");this.enabled=t.visualFeedback!==!1}catch{this.enabled=!0}}setEnabled(t){this.enabled=t,chrome.storage.local.set({visualFeedback:t}),t||this.clearAll()}highlight(t,s){if(!this.enabled||s<70)return;if(this.highlightedLinks.has(t)){this._updateHighlight(t,s);return}const i=t.getBoundingClientRect(),e=document.createElement("div");e.className="instantnav-ghost-highlight",s>=90?e.classList.add("score-max"):s>=80&&e.classList.add("score-high"),e.style.position="absolute",e.style.top=`${i.top+window.scrollY-2}px`,e.style.left=`${i.left+window.scrollX-2}px`,e.style.width=`${i.width+4}px`,e.style.height=`${i.height+4}px`,document.body.appendChild(e),this.highlightedLinks.set(t,{overlay:e,score:s})}_updateHighlight(t,s){const i=this.highlightedLinks.get(t);if(!i)return;const{overlay:e}=i,a=t.getBoundingClientRect();e.style.top=`${a.top+window.scrollY-2}px`,e.style.left=`${a.left+window.scrollX-2}px`,e.style.width=`${a.width+4}px`,e.style.height=`${a.height+4}px`,e.classList.remove("score-high","score-max"),s>=90?e.classList.add("score-max"):s>=80&&e.classList.add("score-high"),i.score=s}unhighlight(t){const s=this.highlightedLinks.get(t);s&&(s.overlay.remove(),this.highlightedLinks.delete(t))}clearAll(){for(const[t,s]of this.highlightedLinks)s.overlay.remove();this.highlightedLinks.clear()}updateFromPredictions(t){if(!this.enabled)return;const s=new Set(t.map(i=>i.element));for(const[i,e]of this.highlightedLinks)s.has(i)||this.unhighlight(i);for(const i of t)i.score>=70&&this.highlight(i.element,i.score)}}window.instantNavFeedback=new h,console.log("[InstantNav] Visual Feedback initialized")})();
//# sourceMappingURL=visual-feedback.js.map
