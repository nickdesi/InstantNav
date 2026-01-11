/**
 * InstantNav - Popup Logic
 */

class PopupController {
    constructor() {
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadStats();
        await this.loadMode();
        await this.loadCurrentSite();
    }

    async loadStats() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });

            if (response) {
                document.getElementById('time-saved').textContent =
                    this.formatTime(response.timeSaved || 0);

                document.getElementById('prefetched').textContent =
                    response.totalPrefetches || 0;

                const precision = response.totalPrefetches > 0
                    ? Math.round((response.successfulPredictions / response.totalPrefetches) * 100)
                    : '--';
                document.getElementById('precision').textContent =
                    precision === '--' ? precision : `${precision}%`;
            }
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }

    async loadMode() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_MODE' });
            const mode = response?.mode || 'auto';

            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });
        } catch (e) {
            console.error('Failed to load mode:', e);
        }
    }

    async loadCurrentSite() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.url) {
                const url = new URL(tab.url);
                document.getElementById('current-domain').textContent = url.hostname;

                // Load trust level
                const result = await chrome.storage.local.get('trustLevels');
                const trustLevels = result.trustLevels || {};
                const level = trustLevels[url.hostname] || 'neutral';
                document.getElementById('trust-select').value = level;
            }
        } catch (e) {
            console.error('Failed to load current site:', e);
        }
    }

    setupEventListeners() {
        // Enable toggle
        document.getElementById('enabled-toggle').addEventListener('change', (e) => {
            chrome.storage.local.set({ enabled: e.target.checked });
        });

        // Mode buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                chrome.runtime.sendMessage({ type: 'SET_MODE', mode });

                document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Trust select
        document.getElementById('trust-select').addEventListener('change', async (e) => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.url) {
                const hostname = new URL(tab.url).hostname;
                const result = await chrome.storage.local.get('trustLevels');
                const trustLevels = result.trustLevels || {};
                trustLevels[hostname] = e.target.value;
                await chrome.storage.local.set({ trustLevels });
            }
        });

        // Dashboard button
        document.getElementById('open-dashboard').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
        });

        // Settings button
        document.getElementById('open-settings').addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html#settings') });
        });
    }

    formatTime(ms) {
        const seconds = ms / 1000;
        if (seconds < 60) {
            return `${seconds.toFixed(1)}s`;
        }
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
    }
}

// Debug Error Handler
function showError(msg) {
    const el = document.getElementById('debug-error');
    if (el) {
        el.style.display = 'block';
        el.textContent = 'ERR: ' + msg;
    }
}

window.onerror = function (msg, url, line, col, error) {
    showError(`${msg} (${line}:${col})`);
    return false;
};

// Initialize
function init() {
    try {
        new PopupController();
    } catch (e) {
        showError(e.message);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
