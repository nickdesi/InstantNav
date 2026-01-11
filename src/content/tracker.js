/**
 * InstantNav - Cursor Tracker
 * Tracks cursor position, velocity, and acceleration at 60fps
 * with intelligent throttling for heavy calculations
 */

const CAPTURE_INTERVAL = 16;  // ~60fps
const BATCH_INTERVAL = 80;    // Heavy calculations every 80ms

class CursorTracker {
    constructor() {
        this.position = { x: 0, y: 0 };
        this.velocity = { vx: 0, vy: 0 };
        this.acceleration = { ax: 0, ay: 0 };
        this.direction = 0; // angle in radians

        this.lastPosition = { x: 0, y: 0 };
        this.lastVelocity = { vx: 0, vy: 0 };
        this.lastTimestamp = performance.now();

        this.listeners = new Set();
        this.isTracking = false;

        this._boundMouseMove = this._onMouseMove.bind(this);
    }

    start() {
        if (this.isTracking) return;
        this.isTracking = true;
        document.addEventListener('mousemove', this._boundMouseMove, { passive: true });
    }

    stop() {
        this.isTracking = false;
        document.removeEventListener('mousemove', this._boundMouseMove);
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    _onMouseMove(event) {
        const now = performance.now();
        const dt = (now - this.lastTimestamp) / 1000; // in seconds

        if (dt < CAPTURE_INTERVAL / 1000) return; // Throttle to ~60fps

        // Update position
        this.position.x = event.clientX;
        this.position.y = event.clientY;

        // Calculate velocity (pixels per second)
        this.velocity.vx = (this.position.x - this.lastPosition.x) / dt;
        this.velocity.vy = (this.position.y - this.lastPosition.y) / dt;

        // Calculate acceleration
        this.acceleration.ax = (this.velocity.vx - this.lastVelocity.vx) / dt;
        this.acceleration.ay = (this.velocity.vy - this.lastVelocity.vy) / dt;

        // Calculate direction (angle in radians)
        this.direction = Math.atan2(this.velocity.vy, this.velocity.vx);

        // Store for next frame
        this.lastPosition = { ...this.position };
        this.lastVelocity = { ...this.velocity };
        this.lastTimestamp = now;

        // Notify listeners
        const data = this.getData();
        this.listeners.forEach(cb => cb(data));
    }

    getData() {
        return {
            position: { ...this.position },
            velocity: { ...this.velocity },
            acceleration: { ...this.acceleration },
            direction: this.direction,
            speed: Math.sqrt(this.velocity.vx ** 2 + this.velocity.vy ** 2),
            isDecelerating: this._isDecelerating(),
            timestamp: performance.now()
        };
    }

    _isDecelerating() {
        // Check if cursor is slowing down (approaching target)
        const currentSpeed = Math.sqrt(this.velocity.vx ** 2 + this.velocity.vy ** 2);
        const prevSpeed = Math.sqrt(this.lastVelocity.vx ** 2 + this.lastVelocity.vy ** 2);
        return currentSpeed < prevSpeed * 0.8; // 20% slower = decelerating
    }

    /**
     * Calculate intention vector towards a target point
     * Returns dot product (1 = moving directly towards, -1 = moving away)
     */
    getIntentionScore(targetX, targetY) {
        const dx = targetX - this.position.x;
        const dy = targetY - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) return 1; // Already on target

        // Normalize vectors
        const toTargetX = dx / distance;
        const toTargetY = dy / distance;

        const speed = Math.sqrt(this.velocity.vx ** 2 + this.velocity.vy ** 2);
        if (speed === 0) return 0; // Not moving

        const velocityX = this.velocity.vx / speed;
        const velocityY = this.velocity.vy / speed;

        // Dot product: 1 = same direction, -1 = opposite
        return toTargetX * velocityX + toTargetY * velocityY;
    }
}

// Global instance
window.instantNavTracker = new CursorTracker();
window.instantNavTracker.start();

console.log('[InstantNav] Cursor Tracker initialized');
