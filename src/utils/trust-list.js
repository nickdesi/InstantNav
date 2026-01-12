/**
 * InstantNav - Trust List Manager
 * Manages site trust levels for privacy-aware prefetching
 */

const DEFAULT_TRUSTED = [
    'github.com',
    'stackoverflow.com',
    'wikipedia.org',
    'youtube.com',
    'reddit.com'
];

const KNOWN_TRACKERS = [
    'doubleclick.net',
    'googlesyndication.com',
    'facebook.net',
    'analytics.google.com'
];

const BLACKLISTED = [
    'google.com',
    'www.google.com',
    'accounts.google.com',
    'myaccount.google.com',
    'recaptcha.net',
    'bankofamerica.com',
    'chase.com',
    'paypal.com'
];

class TrustList {
    constructor() {
        this.trustLevels = {}; // domain -> 'trusted' | 'neutral' | 'untrusted'
        this.load();
    }

    async load() {
        try {
            const result = await chrome.storage.local.get('trustLevels');
            this.trustLevels = result.trustLevels || {};
        } catch (e) {
            this.trustLevels = {};
        }
    }

    async save() {
        await chrome.storage.local.set({ trustLevels: this.trustLevels });
    }

    /**
     * Get trust level for a domain
     * Returns: 'trusted', 'neutral', or 'untrusted'
     */
    getTrustLevel(url) {
        try {
            const domain = this._extractDomain(url);

            // Check explicit settings first
            if (this.trustLevels[domain]) {
                return this.trustLevels[domain];
            }

            // Check known trackers
            if (this._isKnownTracker(domain)) {
                return 'untrusted';
            }

            // Check blacklisted (sensitive/rate-limited)
            if (this._isBlacklisted(domain)) {
                return 'untrusted';
            }

            // Check default trusted
            if (this._isDefaultTrusted(domain)) {
                return 'trusted';
            }

            return 'neutral';
        } catch {
            return 'neutral';
        }
    }

    /**
     * Set trust level for a domain
     */
    async setTrustLevel(url, level) {
        const domain = this._extractDomain(url);
        this.trustLevels[domain] = level;
        await this.save();
    }

    /**
     * Check if prefetch/prerender is allowed for this URL
     */
    canPrefetch(url) {
        const level = this.getTrustLevel(url);
        return level === 'trusted' || level === 'neutral';
    }

    canPrerender(url) {
        const level = this.getTrustLevel(url);
        return level === 'trusted';
    }

    /**
     * Promote a domain to trusted after multiple visits
     */
    async promoteIfFrequent(domain, visitCount) {
        if (visitCount >= 10 && this.getTrustLevel(domain) === 'neutral') {
            this.trustLevels[domain] = 'trusted';
            await this.save();
            return true;
        }
        return false;
    }

    _extractDomain(url) {
        try {
            const hostname = new URL(url).hostname;
            // Remove www. prefix
            return hostname.replace(/^www\./, '');
        } catch {
            return url;
        }
    }

    _isKnownTracker(domain) {
        return KNOWN_TRACKERS.some(tracker =>
            domain === tracker || domain.endsWith(`.${tracker}`)
        );
    }

    _isBlacklisted(domain) {
        return BLACKLISTED.some(blocked =>
            domain === blocked || domain.endsWith(`.${blocked}`)
        );
    }

    _isDefaultTrusted(domain) {
        return DEFAULT_TRUSTED.some(trusted =>
            domain === trusted || domain.endsWith(`.${trusted}`)
        );
    }

    /**
     * Get all manually set trust levels
     */
    getAll() {
        return { ...this.trustLevels };
    }

    /**
     * Reset to defaults
     */
    async reset() {
        this.trustLevels = {};
        await this.save();
    }
}

export const trustList = new TrustList();
