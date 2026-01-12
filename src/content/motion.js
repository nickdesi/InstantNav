/**
 * InstantNav - Motion Flow
 * Injects Native View Transitions for smooth page navigations
 */

(function () {
    // Only enable if browser supports it
    if (!document.startViewTransition) return;

    // Create style element for view transitions
    const style = document.createElement('style');
    style.textContent = `
        @view-transition {
            navigation: auto;
        }
    `;

    // Inject into head
    document.head.appendChild(style);

    // Mark as initialized for debugging
    document.documentElement.setAttribute('data-instantnav-motion', 'true');
    console.log('[InstantNav] Motion Flow initialized');
})();
