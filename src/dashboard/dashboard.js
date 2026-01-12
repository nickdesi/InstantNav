/**
 * InstantNav - Dashboard Controller
 */

import Chart from 'chart.js/auto';
import { learningDB } from '../storage/learning-db.js';

class DashboardController {
    constructor() {
        this.charts = {};
        this.init();
    }

    async init() {
        this.setupNavigation();
        this.setupSettings();
        this.initCharts();
        await this.loadStats();
    }

    setupNavigation() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = link.getAttribute('href').substring(1);

                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                if (target === 'settings') {
                    document.getElementById('stats').style.display = 'none';
                    document.getElementById('settings').style.display = 'block';
                } else {
                    document.getElementById('stats').style.display = 'block';
                    document.getElementById('settings').style.display = 'none';
                }
            });
        });

        // Check URL hash
        if (window.location.hash === '#settings') {
            document.querySelector('[href="#settings"]').click();
        }
    }

    async loadStats() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });

            if (response) {
                document.getElementById('total-time-saved').textContent =
                    this.formatTime(response.timeSaved || 0);

                document.getElementById('pages-loaded').textContent =
                    response.totalPrefetches || 0;

                const precision = response.totalPrefetches > 0
                    ? Math.round((response.successfulPredictions / response.totalPrefetches) * 100)
                    : '--';
                document.getElementById('precision-rate').textContent =
                    precision === '--' ? `${precision}` : `${precision}%`;
            }

            // RAM usage (estimate)
            if (performance.memory) {
                const usedMB = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
                document.getElementById('ram-usage').textContent = `${usedMB} MB`;
            }
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }

    async initCharts() {
        const stats = await learningDB.getDailyStats(7);
        const labels = stats.map(s => {
            const d = new Date(s.date);
            return d.toLocaleDateString('fr-FR', { weekday: 'short' });
        });
        const data = stats.map(s => Math.round(s.timeSaved / 1000)); // Seconds

        // Time saved chart
        const timeCtx = document.getElementById('time-chart').getContext('2d');
        this.charts.time = new Chart(timeCtx, {
            type: 'line',
            data: {
                labels: labels.reverse(),
                datasets: [{
                    label: 'Temps gagné (s)',
                    data: data.reverse(),
                    borderColor: 'rgb(168, 85, 247)',
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } },
                    y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } }
                }
            }
        });

        // Precision chart (doughnut)
        const total = stats.reduce((acc, val) => acc + val.prefetches, 0);
        const successful = stats.reduce((acc, val) => acc + val.successfulPredictions, 0);
        const wasted = total - successful;

        const precisionCtx = document.getElementById('precision-chart').getContext('2d');
        this.charts.precision = new Chart(precisionCtx, {
            type: 'doughnut',
            data: {
                labels: ['Utiles', 'Gaspillées'],
                datasets: [{
                    data: total > 0 ? [successful, wasted] : [0, 1], // Placeholder if empty
                    backgroundColor: ['rgb(34, 197, 94)', 'rgba(255, 255, 255, 0.1)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#9ca3af' } }
                }
            }
        });

        // Top sites
        await this.renderTopSites();
    }

    async renderTopSites() {
        const sites = await learningDB.getFrequentDomains(5);
        const container = document.getElementById('top-sites');

        if (sites.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Aucune donnée pour le moment</div>';
            return;
        }

        container.innerHTML = sites.map((site, i) => `
      <div class="site-item">
        <span class="site-rank">#${i + 1}</span>
        <span class="site-domain">${site.domain}</span>
        <span class="site-time">${this.formatTime(site.avgLoadTime)} (avg)</span>
      </div>
    `).join('');
    }

    setupSettings() {


        // Default mode
        document.getElementById('default-mode').addEventListener('change', (e) => {
            chrome.runtime.sendMessage({ type: 'SET_MODE', mode: e.target.value });
        });

        // Reset learning
        document.getElementById('reset-learning').addEventListener('click', async () => {
            if (confirm('Voulez-vous vraiment réinitialiser toutes les données d\'apprentissage ?')) {
                await chrome.storage.local.remove(['learningData', 'stats']);
                alert('Données réinitialisées !');
                location.reload();
            }
        });

        // Export data
        document.getElementById('export-data').addEventListener('click', async () => {
            const data = await chrome.storage.local.get(null);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'instantnav-data.json';
            a.click();
        });

        // Load saved settings
        this.loadSettings();
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['visualFeedback', 'prefetchMode']);

            if (result.prefetchMode) {
                document.getElementById('default-mode').value = result.prefetchMode;
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }

    getLast7Days() {
        const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        const result = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            result.push(days[date.getDay()]);
        }
        return result;
    }

    generateMockData(count, min, max) {
        return Array.from({ length: count }, () =>
            Math.floor(Math.random() * (max - min + 1)) + min
        );
    }

    formatTime(ms) {
        const seconds = ms / 1000;
        if (seconds < 60) return `${seconds.toFixed(1)}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
        if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        return `${hours}h ${remainingMinutes}m`;
    }
}

// Initialize
// Initialize
function init() {
    new DashboardController();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
