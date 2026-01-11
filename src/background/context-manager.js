/**
 * InstantNav - Context Manager
 * Adapts prefetching behavior based on battery, network, and RAM
 */

export class ContextManager {
    constructor() {
        this.currentMode = 'auto'; // 'turbo', 'balanced', 'eco', 'auto'
        this.contextData = {
            battery: { charging: true, level: 1 },
            network: { type: 'wifi', downlink: 10 },
            memory: { usedPercent: 0.5 }
        };

        this.profiles = {
            turbo: {
                maxPrerender: 3,
                maxPrefetch: 10,
                prerenderThreshold: 70,
                prefetchThreshold: 50,
                preconnectThreshold: 30
            },
            balanced: {
                maxPrerender: 1,
                maxPrefetch: 5,
                prerenderThreshold: 80,
                prefetchThreshold: 60,
                preconnectThreshold: 40
            },
            eco: {
                maxPrerender: 0,
                maxPrefetch: 2,
                prerenderThreshold: 100, // Never prerender
                prefetchThreshold: 85,
                preconnectThreshold: 70
            }
        };

        this._startMonitoring();
    }

    async _startMonitoring() {
        // Monitor battery
        if ('getBattery' in navigator) {
            try {
                const battery = await navigator.getBattery();
                this._updateBattery(battery);

                battery.addEventListener('chargingchange', () => this._updateBattery(battery));
                battery.addEventListener('levelchange', () => this._updateBattery(battery));
            } catch (e) {
                console.warn('[InstantNav] Battery API not available');
            }
        }

        // Monitor network
        if ('connection' in navigator) {
            const conn = navigator.connection;
            this._updateNetwork(conn);

            conn.addEventListener('change', () => this._updateNetwork(conn));
        }

        // Monitor memory periodically
        this._checkMemory();
        setInterval(() => this._checkMemory(), 30000); // Every 30s
    }

    _updateBattery(battery) {
        this.contextData.battery = {
            charging: battery.charging,
            level: battery.level
        };
        this._recalculateMode();
    }

    _updateNetwork(connection) {
        this.contextData.network = {
            type: connection.effectiveType || 'unknown',
            downlink: connection.downlink || 10,
            saveData: connection.saveData || false
        };
        this._recalculateMode();
    }

    _checkMemory() {
        if ('memory' in performance) {
            const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory;
            this.contextData.memory = {
                usedPercent: usedJSHeapSize / jsHeapSizeLimit
            };
            this._recalculateMode();
        }
    }

    _recalculateMode() {
        if (this.currentMode !== 'auto') return;

        const { battery, network, memory } = this.contextData;

        // Determine effective mode based on context
        let effectiveMode = 'balanced';

        // Eco conditions
        if (
            (!battery.charging && battery.level < 0.2) ||
            network.saveData ||
            network.type === '2g' ||
            network.type === 'slow-2g' ||
            memory.usedPercent > 0.8
        ) {
            effectiveMode = 'eco';
        }

        // Turbo conditions
        else if (
            battery.charging &&
            (network.type === '4g' || network.downlink > 5) &&
            memory.usedPercent < 0.5
        ) {
            effectiveMode = 'turbo';
        }

        this._effectiveMode = effectiveMode;
    }

    setMode(mode) {
        if (['turbo', 'balanced', 'eco', 'auto'].includes(mode)) {
            this.currentMode = mode;
            chrome.storage.local.set({ prefetchMode: mode });
            this._recalculateMode();
        }
    }

    getProfile() {
        const mode = this.currentMode === 'auto'
            ? (this._effectiveMode || 'balanced')
            : this.currentMode;

        return this.profiles[mode];
    }

    getStatus() {
        return {
            mode: this.currentMode,
            effectiveMode: this._effectiveMode || this.currentMode,
            context: this.contextData,
            profile: this.getProfile()
        };
    }
}
