/**
 * InstantNav - Learning Database
 * Local IndexedDB storage for user behavior patterns
 */

import { openDB } from 'idb';

const DB_NAME = 'instantnav';
const DB_VERSION = 1;

class LearningDB {
    constructor() {
        this.db = null;
        this.init();
    }

    async init() {
        this.db = await openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                // Click patterns store
                if (!db.objectStoreNames.contains('clickPatterns')) {
                    const store = db.createObjectStore('clickPatterns', { keyPath: 'domain' });
                    store.createIndex('frequency', 'frequency');
                }

                // Daily stats store
                if (!db.objectStoreNames.contains('dailyStats')) {
                    db.createObjectStore('dailyStats', { keyPath: 'date' });
                }

                // Link preferences store
                if (!db.objectStoreNames.contains('linkPreferences')) {
                    db.createObjectStore('linkPreferences', { keyPath: 'type' });
                }
            }
        });
    }

    // Click Patterns
    async recordClick(url, loadTime) {
        if (!this.db) await this.init();

        try {
            const domain = new URL(url).hostname;
            const existing = await this.db.get('clickPatterns', domain);

            const pattern = existing || {
                domain,
                totalClicks: 0,
                avgLoadTime: 0,
                lastVisit: null,
                frequency: 'rare'
            };

            // Update stats
            pattern.totalClicks++;
            pattern.avgLoadTime = (pattern.avgLoadTime * (pattern.totalClicks - 1) + loadTime) / pattern.totalClicks;
            pattern.lastVisit = Date.now();

            // Calculate frequency
            pattern.frequency = this._calculateFrequency(pattern);

            await this.db.put('clickPatterns', pattern);
        } catch (e) {
            console.error('[InstantNav] Failed to record click:', e);
        }
    }

    _calculateFrequency(pattern) {
        if (pattern.totalClicks >= 50) return 'daily';
        if (pattern.totalClicks >= 20) return 'weekly';
        if (pattern.totalClicks >= 5) return 'monthly';
        return 'rare';
    }

    async getClickPattern(domain) {
        if (!this.db) await this.init();
        return this.db.get('clickPatterns', domain);
    }

    async getFrequentDomains(limit = 10) {
        if (!this.db) await this.init();

        const all = await this.db.getAll('clickPatterns');
        return all
            .sort((a, b) => b.totalClicks - a.totalClicks)
            .slice(0, limit);
    }

    // Daily Stats
    async recordDailyStats(stats) {
        if (!this.db) await this.init();

        const today = new Date().toISOString().split('T')[0];
        const existing = await this.db.get('dailyStats', today);

        const dayStats = existing || {
            date: today,
            timeSaved: 0,
            prefetches: 0,
            successfulPredictions: 0
        };

        dayStats.timeSaved += stats.timeSaved || 0;
        dayStats.prefetches += stats.prefetches || 0;
        dayStats.successfulPredictions += stats.successfulPredictions || 0;

        await this.db.put('dailyStats', dayStats);
    }

    async getDailyStats(days = 7) {
        if (!this.db) await this.init();

        const results = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const stats = await this.db.get('dailyStats', dateStr);
            results.push(stats || {
                date: dateStr,
                timeSaved: 0,
                prefetches: 0,
                successfulPredictions: 0
            });
        }

        return results;
    }

    // Link Preferences
    async updateLinkPreference(type, weight) {
        if (!this.db) await this.init();

        const existing = await this.db.get('linkPreferences', type);
        const pref = existing || { type, weight: 0.5, clicks: 0 };

        // Running average
        pref.clicks++;
        pref.weight = (pref.weight * (pref.clicks - 1) + weight) / pref.clicks;

        await this.db.put('linkPreferences', pref);
    }

    async getLinkPreferences() {
        if (!this.db) await this.init();
        return this.db.getAll('linkPreferences');
    }

    // Cleanup
    async cleanup(maxAgeeDays = 30) {
        if (!this.db) await this.init();

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - maxAgeeDays);
        const cutoffStr = cutoff.toISOString().split('T')[0];

        // Remove old daily stats
        const allStats = await this.db.getAll('dailyStats');
        for (const stat of allStats) {
            if (stat.date < cutoffStr) {
                await this.db.delete('dailyStats', stat.date);
            }
        }
    }

    async clear() {
        if (!this.db) await this.init();

        await this.db.clear('clickPatterns');
        await this.db.clear('dailyStats');
        await this.db.clear('linkPreferences');
    }
}

export const learningDB = new LearningDB();
