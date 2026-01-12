/**
 * InstantNav - Visual Feedback
 * Ghost highlight effect on links being prefetched
 */

class VisualFeedback {
    constructor() {
        this.enabled = true;
        this.highlightedLinks = new Map(); // element -> { overlay, score }
        this.styleSheet = null;

        this._injectStyles();
        this._loadSettings();
    }

    _injectStyles() {
        this.styleSheet = document.createElement('style');
        this.styleSheet.textContent = `
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
    `;
        document.head.appendChild(this.styleSheet);
    }

    async _loadSettings() {
        try {
            const result = await chrome.storage.local.get('visualFeedback');
            this.enabled = result.visualFeedback !== false;
        } catch {
            this.enabled = true;
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        chrome.storage.local.set({ visualFeedback: enabled });

        if (!enabled) {
            this.clearAll();
        }
    }

    highlight(element, score) {
        if (!this.enabled || score < 70) return; // Only show for high scores

        // Check if already highlighted
        if (this.highlightedLinks.has(element)) {
            this._updateHighlight(element, score);
            return;
        }

        const rect = element.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.className = 'instantnav-ghost-highlight';

        // Add score class
        if (score >= 90) {
            overlay.classList.add('score-max');
        } else if (score >= 80) {
            overlay.classList.add('score-high');
        }

        // Position overlay
        overlay.style.position = 'absolute';
        overlay.style.top = `${rect.top + window.scrollY - 2}px`;
        overlay.style.left = `${rect.left + window.scrollX - 2}px`;
        overlay.style.width = `${rect.width + 4}px`;
        overlay.style.height = `${rect.height + 4}px`;

        document.body.appendChild(overlay);

        this.highlightedLinks.set(element, { overlay, score });
    }

    _updateHighlight(element, score) {
        const data = this.highlightedLinks.get(element);
        if (!data) return;

        const { overlay } = data;
        const rect = element.getBoundingClientRect();

        // Update position
        overlay.style.top = `${rect.top + window.scrollY - 2}px`;
        overlay.style.left = `${rect.left + window.scrollX - 2}px`;
        overlay.style.width = `${rect.width + 4}px`;
        overlay.style.height = `${rect.height + 4}px`;

        // Update score class
        overlay.classList.remove('score-high', 'score-max');
        if (score >= 90) {
            overlay.classList.add('score-max');
        } else if (score >= 80) {
            overlay.classList.add('score-high');
        }

        data.score = score;
    }

    unhighlight(element) {
        const data = this.highlightedLinks.get(element);
        if (!data) return;

        data.overlay.remove();
        this.highlightedLinks.delete(element);
    }

    clearAll() {
        for (const [element, data] of this.highlightedLinks) {
            data.overlay.remove();
        }
        this.highlightedLinks.clear();
    }

    /**
     * Update highlights based on prediction results
     */
    updateFromPredictions(predictions) {
        if (!this.enabled) return;

        // Remove highlights for links no longer in top predictions
        const currentUrls = new Set(predictions.map(p => p.url));

        for (const [element, data] of this.highlightedLinks) {
            if (!currentUrls.has(element.href)) {
                this.unhighlight(element);
            }
        }

        // Add/update highlights for top predictions
        for (const pred of predictions) {
            if (pred.score >= 70) {
                this.highlight(pred.element, pred.score);
            }
        }
    }
}

// Global instance
window.instantNavFeedback = new VisualFeedback();

console.log('[InstantNav] Visual Feedback initialized');
