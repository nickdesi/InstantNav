/**
 * InstantNav - Prefetcher
 * Uses Speculation Rules API for advanced prefetching and prerendering
 */

export class Prefetcher {
    constructor() {
        this.prefetchedUrls = new Map(); // url -> { type, timestamp }
        this.activeSpeculationRules = [];
        this.maxRules = 10; // Prevent memory bloat
    }

    /**
     * DNS Prefetch - Lightest, just resolves DNS
     */
    async dnsPrefetch(url) {
        try {
            const domain = new URL(url).origin;

            // Inject link element via content script
            this._injectLinkHint(domain, 'dns-prefetch');

            this._track(url, 'dns-prefetch');
        } catch (e) {
            console.warn('[InstantNav] DNS prefetch failed:', e);
        }
    }

    /**
     * Preconnect - DNS + TCP + TLS handshake
     */
    async preconnect(url) {
        try {
            const domain = new URL(url).origin;

            this._injectLinkHint(domain, 'preconnect');

            this._track(url, 'preconnect');
        } catch (e) {
            console.warn('[InstantNav] Preconnect failed:', e);
        }
    }

    /**
     * Prefetch - Downloads HTML document
     */
    async prefetch(url, tabId) {
        if (this.prefetchedUrls.has(url)) return;

        try {
            // Use Speculation Rules API if available
            await this._addSpeculationRule(tabId, 'prefetch', url);

            this._track(url, 'prefetch');
        } catch (e) {
            console.warn('[InstantNav] Prefetch failed:', e);
        }
    }

    /**
     * Prerender - Full page render in background
     */
    async prerender(url, tabId) {
        if (this.prefetchedUrls.has(url)) return;

        try {
            // Use Speculation Rules API for prerender
            await this._addSpeculationRule(tabId, 'prerender', url);

            this._track(url, 'prerender');
        } catch (e) {
            console.warn('[InstantNav] Prerender failed:', e);
        }
    }

    /**
     * Add Speculation Rules via content script injection
     */
    async _addSpeculationRule(tabId, type, url) {
        // Clean up old rules to prevent memory bloat
        if (this.activeSpeculationRules.length >= this.maxRules) {
            await this._removeOldestRule(tabId);
        }

        const rule = {
            [type]: [{
                source: 'list',
                urls: [url],
                eagerness: type === 'prerender' ? 'moderate' : 'eager'
            }]
        };

        // Inject speculation rules script into page
        await chrome.scripting.executeScript({
            target: { tabId },
            func: (ruleJson) => {
                // Remove existing speculation rules with same URL
                const existingScripts = document.querySelectorAll('script[type="speculationrules"][data-instantnav]');
                existingScripts.forEach(s => {
                    try {
                        const rules = JSON.parse(s.textContent);
                        const hasUrl = Object.values(rules).flat().some(r => r.urls?.includes(ruleJson.url));
                        if (hasUrl) s.remove();
                    } catch { }
                });

                // Add new speculation rules
                const script = document.createElement('script');
                script.type = 'speculationrules';
                script.setAttribute('data-instantnav', 'true');
                script.textContent = JSON.stringify(ruleJson.rule);
                document.head.appendChild(script);
            },
            args: [{ rule, url }]
        });

        this.activeSpeculationRules.push({ type, url, timestamp: Date.now() });
    }

    async _removeOldestRule(tabId) {
        const oldest = this.activeSpeculationRules.shift();
        if (!oldest) return;

        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: (urlToRemove) => {
                    const scripts = document.querySelectorAll('script[type="speculationrules"][data-instantnav]');
                    scripts.forEach(s => {
                        try {
                            const content = s.textContent;
                            if (content.includes(urlToRemove)) {
                                s.remove();
                            }
                        } catch { }
                    });
                },
                args: [oldest.url]
            });
        } catch (e) {
            console.warn('[InstantNav] Failed to remove old rule:', e);
        }

        this.prefetchedUrls.delete(oldest.url);
    }

    _injectLinkHint(href, rel) {
        // This will be injected via content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]?.id) return;

            chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: (href, rel) => {
                    // Check if already exists
                    if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;

                    const link = document.createElement('link');
                    link.rel = rel;
                    link.href = href;
                    document.head.appendChild(link);
                },
                args: [href, rel]
            });
        });
    }

    _track(url, type) {
        this.prefetchedUrls.set(url, { type, timestamp: Date.now() });
    }

    wasPrefetched(url) {
        return this.prefetchedUrls.has(url);
    }

    getPrefetchType(url) {
        return this.prefetchedUrls.get(url)?.type;
    }

    clearOldPrefetches(maxAgeMs = 60000) {
        const now = Date.now();
        for (const [url, data] of this.prefetchedUrls) {
            if (now - data.timestamp > maxAgeMs) {
                this.prefetchedUrls.delete(url);
            }
        }
    }
}
