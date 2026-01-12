/**
 * InstantNav - Link Predictor
 * Calculates click probability scores using Fitts' Law and intention vectors
 */

const GRACE_PERIOD_MS = 200;
const BATCH_INTERVAL_MS = 80;

class LinkPredictor {
    constructor() {
        this.links = [];
        this.scores = new Map(); // URL -> { score, timestamp }
        this.graceTimers = new Map(); // URL -> timeout
        this.lastBatchTime = 0;

        this._setupObserver();
        this._initBatteryStatus();
        this._scanLinks();
    }

    async _initBatteryStatus() {
        if (navigator.getBattery) {
            try {
                const battery = await navigator.getBattery();
                this.isCharging = battery.charging;
                battery.addEventListener('chargingchange', () => {
                    this.isCharging = battery.charging;
                });
            } catch (e) {
                this.isCharging = true; // Assume plugged in if error
            }
        } else {
            this.isCharging = true;
        }
    }

    _setupObserver() {
        // Watch for DOM changes to detect new links
        const observer = new MutationObserver(() => {
            this._scanLinks();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    _scanLinks() {
        this.links = Array.from(document.querySelectorAll('a[href]'))
            .filter(link => {
                const href = link.getAttribute('href');
                return href &&
                    !href.startsWith('#') &&
                    !href.startsWith('javascript:') &&
                    !href.startsWith('mailto:');
            })
            .map(link => ({
                element: link,
                url: link.href,
                rect: link.getBoundingClientRect(),
                isVisible: this._isVisible(link)
            }));
    }

    _isVisible(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    /**
     * Fitts' Law Score (inverted)
     * Lower ID = easier click = higher score
     */
    _calculateFittsScore(distance, width, height) {
        const minDimension = Math.min(width, height);
        if (minDimension <= 0) return 0;

        const id = Math.log2(distance / minDimension + 1);
        const k = 15; // Normalization factor
        const score = Math.max(0, Math.min(100, 100 - id * k));

        return score;
    }

    /**
     * Calculate all scores for visible links
     */
    calculateScores(cursorData) {
        const now = performance.now();

        // Dynamic throttling based on environment
        let currentInterval = BATCH_INTERVAL_MS;

        // 1. Network check
        if (navigator.connection) {
            if (navigator.connection.saveData) currentInterval *= 2; // 160ms
            if (['slow-2g', '2g', '3g'].includes(navigator.connection.effectiveType)) currentInterval *= 1.5; // 120ms
        }

        // 2. Battery check (if API available)
        if (navigator.getBattery && !this.isCharging) {
            currentInterval *= 1.25; // 100ms
        }

        // Throttle heavy calculations
        if (now - this.lastBatchTime < currentInterval) return;
        this.lastBatchTime = now;

        // Skip calculations if user is scrolling fast (high noise)
        if (window.instantNavTracker && window.instantNavTracker.scrollSpeed > 100) {
            return;
        }

        // Refresh link positions if viewport changed
        this._scanLinks();

        const results = [];

        for (const link of this.links) {
            if (!link.isVisible) continue;

            const rect = link.rect;
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Distance from cursor to link center
            const dx = centerX - cursorData.position.x;
            const dy = centerY - cursorData.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // 1. Fitts Score (30%)
            const fittsScore = this._calculateFittsScore(distance, rect.width, rect.height);

            // 2. Intention Vector Score (30%)
            const intentionRaw = window.instantNavTracker.getIntentionScore(centerX, centerY);
            const intentionScore = Math.max(0, intentionRaw * 100); // 0-100

            // 3. Proximity Score (15%)
            const maxDistance = Math.sqrt(window.innerWidth ** 2 + window.innerHeight ** 2);
            const proximityScore = Math.max(0, 100 - (distance / maxDistance) * 100);

            // 4. Context Score (10%) - prioritize main content over footer/sidebar
            const contextScore = this._getContextScore(link.element);

            // 5. History Score (15%) - placeholder for learning engine
            const historyScore = this._getHistoryScore(link.url);

            // Weighted total
            const totalScore =
                fittsScore * 0.30 +
                intentionScore * 0.30 +
                proximityScore * 0.15 +
                contextScore * 0.10 +
                historyScore * 0.15;

            // Apply grace period boost if cursor stopped near link
            const graceBoost = this._getGraceBoost(link.url, totalScore, cursorData);
            const finalScore = Math.min(100, totalScore + graceBoost);

            this.scores.set(link.url, {
                score: finalScore,
                timestamp: now,
                breakdown: { fittsScore, intentionScore, proximityScore, contextScore, historyScore }
            });

            results.push({
                url: link.url,
                element: link.element,
                score: finalScore
            });
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        // Notify prefetcher with top candidates
        this._notifyPrefetcher(results.slice(0, 5));



        return results;
    }

    _getContextScore(element) {
        // Check if link is in main content vs navigation/footer
        const parent = element.closest('main, article, [role="main"]');
        if (parent) return 80;

        const nav = element.closest('nav, footer, aside, [role="navigation"]');
        if (nav) return 30;

        // Check position in viewport (top = more likely to click)
        const rect = element.getBoundingClientRect();
        const viewportPosition = rect.top / window.innerHeight;
        return 50 + (1 - viewportPosition) * 30;
    }

    _getHistoryScore(url) {
        // Placeholder - will be enhanced by Learning Engine
        // For now, give slight boost to same-domain links
        try {
            const linkDomain = new URL(url).hostname;
            const currentDomain = window.location.hostname;
            return linkDomain === currentDomain ? 60 : 40;
        } catch {
            return 40;
        }
    }

    _getGraceBoost(url, currentScore, cursorData) {
        // Grace Period: maintain score for 200ms after cursor stops near link
        if (cursorData.speed < 50 && currentScore > 50) {
            // Cursor almost stopped and score is decent
            if (!this.graceTimers.has(url)) {
                const existingScore = this.scores.get(url);
                if (existingScore && existingScore.score > currentScore) {
                    // Start grace period
                    this.graceTimers.set(url, setTimeout(() => {
                        this.graceTimers.delete(url);
                    }, GRACE_PERIOD_MS));
                    return existingScore.score - currentScore; // Boost to maintain previous score
                }
            }
        }
        return 0;
    }

    _notifyPrefetcher(topLinks) {
        // Send to background script for prefetching
        chrome.runtime.sendMessage({
            type: 'PREDICTION_UPDATE',
            links: topLinks.map(l => ({
                url: l.url,
                score: l.score
            }))
        });
    }

    getScore(url) {
        return this.scores.get(url)?.score || 0;
    }
}

// Initialize and connect to tracker
window.instantNavPredictor = new LinkPredictor();

// Subscribe to cursor updates
window.instantNavTracker.subscribe((data) => {
    window.instantNavPredictor.calculateScores(data);
});

console.log('[InstantNav] Link Predictor initialized');
