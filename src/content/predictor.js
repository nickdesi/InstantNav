/**
 * InstantNav - Link Predictor
 * Calculates click probability scores using Fitts' Law and intention vectors
 */

const GRACE_PERIOD_MS = 200;
const BATCH_INTERVAL_MS = 80;

class LinkPredictor {
    constructor() {
        this.links = new Map(); // element -> { url, rect, isVisible, score }
        this.scores = new Map(); // URL -> { score, timestamp }
        this.graceTimers = new Map(); // URL -> timeout
        this.historyCache = new Map(); // URL -> score
        this.lastBatchTime = 0;

        this._setupObserver();
        this._initBatteryStatus();
        this._setupIntersectionObserver();
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
        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0) {
                    shouldScan = true;
                    break;
                }
            }
            if (shouldScan) this._scanLinks();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial scan
        this._scanLinks();
    }

    _setupIntersectionObserver() {
        this.intersectionObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const linkData = this.links.get(entry.target);
                if (linkData) {
                    linkData.isVisible = entry.isIntersecting;
                    if (entry.isIntersecting) {
                        linkData.rect = entry.boundingClientRect;
                    }
                }
            }
        }, { threshold: 0 });
    }

    _scanLinks() {
        // Disconnect old elements to prevent leaks
        // In a clear implementation we might want to be more granular, 
        // but for now re-scanning ensures we catch everything.
        // Optimization: simple diffing could be better but complexity increases.

        const anchors = document.querySelectorAll('a[href]');

        // Mark current links
        const currentElements = new Set(anchors);

        // Remove old links
        for (const [element, data] of this.links) {
            if (!currentElements.has(element)) {
                this.intersectionObserver.unobserve(element);
                this.links.delete(element);
            }
        }

        // Add new links
        for (const anchor of anchors) {
            if (this.links.has(anchor)) continue;

            const href = anchor.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;

            const data = {
                element: anchor,
                url: anchor.href,
                rect: anchor.getBoundingClientRect(),
                isVisible: false, // Will be updated by IntersectionObserver
                score: 0
            };

            this.links.set(anchor, data);
            this.intersectionObserver.observe(anchor);

            // Prefetch history score
            this._fetchHistoryScore(anchor.href);
        }
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

        // NO rescanning here - delegated into MutationObserver

        const results = [];

        for (const [element, data] of this.links) {
            if (!data.isVisible) continue;

            const rect = data.rect; // Used cached rect from IntersectionObserver or update here if needed? 
            // Better to re-read rect ONLY on mouse move if we want high precision, 
            // but reading rect forces reflow. 
            // IntersectionObserver gives rect, but it might be stale if element moved without scrolling.
            // For high perf, we avoid getBoundingClientRect here if possible, but for Fitts we need it.
            // Let's rely on cached rect but maybe update it less frequently? 
            // Actually, getBoundingClientRect is unavoidable for precise Fitts. 
            // But we can limit it to elements strictly near cursor?
            // For now, sticking to logic but on filtered list.

            // Optimization: if distance > 500px, skip precise calc?
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const dx = centerX - cursorData.position.x;
            const dy = centerY - cursorData.position.y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq > 250000) continue; // > 500px away, ignore

            const distance = Math.sqrt(distanceSq);

            // 1. Fitts Score (30%)
            const fittsScore = this._calculateFittsScore(distance, rect.width, rect.height);

            // 2. Intention Vector Score (30%)
            const intentionRaw = window.instantNavTracker.getIntentionScore(centerX, centerY);
            const intentionScore = Math.max(0, intentionRaw * 100); // 0-100

            // 3. Proximity Score (15%)
            const maxDistance = Math.sqrt(window.innerWidth ** 2 + window.innerHeight ** 2);
            const proximityScore = Math.max(0, 100 - (distance / maxDistance) * 100);

            // 4. Context Score (10%) - prioritize main content over footer/sidebar
            const contextScore = this._getContextScore(element);

            // 5. History Score (15%)
            const historyScore = this._getHistoryScore(data.url);

            // Weighted total
            const totalScore =
                fittsScore * 0.30 +
                intentionScore * 0.30 +
                proximityScore * 0.15 +
                contextScore * 0.10 +
                historyScore * 0.15;

            // Apply grace period boost if cursor stopped near link
            const graceBoost = this._getGraceBoost(data.url, totalScore, cursorData);
            const finalScore = Math.min(100, totalScore + graceBoost);

            data.score = finalScore;

            if (finalScore > 30) { // Only track meaningful scores
                this.scores.set(data.url, {
                    score: finalScore,
                    timestamp: now,
                    breakdown: { fittsScore, intentionScore, proximityScore, contextScore, historyScore }
                });

                results.push({
                    url: data.url,
                    element: element,
                    score: finalScore
                });
            }
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        // Notify prefetcher with top candidates
        if (results.length > 0) {
            this._notifyPrefetcher(results.slice(0, 5));
        }

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
        if (this.historyCache.has(url)) {
            return this.historyCache.get(url);
        }
        return 40; // Default until loaded
    }

    _fetchHistoryScore(url) {
        if (this.historyCache.has(url)) return;

        // Default entry to prevent multiple fetches
        this.historyCache.set(url, 40);

        try {
            chrome.runtime.sendMessage({ type: 'GET_HISTORY_SCORE', url }, (response) => {
                if (response && response.score) {
                    this.historyCache.set(url, response.score);
                }
            });
        } catch (e) {
            // Ignore context invalidated errors
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
