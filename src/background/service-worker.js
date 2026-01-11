/**
 * InstantNav - Service Worker
 * Background script coordinating prefetching and context management
 */

import { Prefetcher } from './prefetcher.js';
import { ContextManager } from './context-manager.js';

class InstantNavService {
    constructor() {
        this.prefetcher = new Prefetcher();
        this.contextManager = new ContextManager();
        this.stats = {
            totalPrefetches: 0,
            successfulPredictions: 0,
            timeSaved: 0,
            startTime: Date.now()
        };

        this._setupMessageListener();
        this._setupTabListener();
        this._loadStats();
    }

    _setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'PREDICTION_UPDATE':
                    this._handlePredictions(message.links, sender.tab?.id);
                    break;

                case 'GET_STATS':
                    sendResponse(this.stats);
                    break;

                case 'GET_MODE':
                    sendResponse({ mode: this.contextManager.currentMode });
                    break;

                case 'SET_MODE':
                    this.contextManager.setMode(message.mode);
                    break;

                case 'NAVIGATION_COMPLETE':
                    this._trackSuccessfulPrediction(message.url, message.loadTime);
                    break;
            }
            return true;
        });
    }

    _setupTabListener() {
        // Track when user actually navigates to a prefetched page
        chrome.webNavigation?.onCompleted?.addListener((details) => {
            if (details.frameId !== 0) return; // Main frame only

            const wasPrefetched = this.prefetcher.wasPrefetched(details.url);
            if (wasPrefetched) {
                this.stats.successfulPredictions++;
                this._saveStats();
            }
        });
    }

    async _handlePredictions(links, tabId) {
        const profile = this.contextManager.getProfile();
        let statsUpdated = false;

        for (const link of links) {
            if (link.score >= profile.prerenderThreshold && profile.maxPrerender > 0) {
                await this.prefetcher.prerender(link.url, tabId);
                this.stats.totalPrefetches++;
                statsUpdated = true;
            } else if (link.score >= profile.prefetchThreshold && profile.maxPrefetch > 0) {
                await this.prefetcher.prefetch(link.url, tabId);
                this.stats.totalPrefetches++;
                statsUpdated = true;
            } else if (link.score >= profile.preconnectThreshold) {
                await this.prefetcher.preconnect(link.url);
            } else if (link.score >= 30) {
                await this.prefetcher.dnsPrefetch(link.url);
            }
        }

        if (statsUpdated) {
            this._saveStats();
        }
    }

    _trackSuccessfulPrediction(url, loadTime) {
        // Estimate time saved (average page load without prefetch: 2s)
        const estimatedSavings = Math.max(0, 2000 - loadTime);
        this.stats.timeSaved += estimatedSavings;
        this._saveStats();
    }

    async _loadStats() {
        try {
            const result = await chrome.storage.local.get('stats');
            if (result.stats) {
                this.stats = { ...this.stats, ...result.stats };
            }
        } catch (e) {
            console.error('[InstantNav] Failed to load stats:', e);
        }
    }

    async _saveStats() {
        try {
            await chrome.storage.local.set({ stats: this.stats });
        } catch (e) {
            console.error('[InstantNav] Failed to save stats:', e);
        }
    }
}

// Initialize service
const service = new InstantNavService();
console.log('[InstantNav] Service Worker initialized');
