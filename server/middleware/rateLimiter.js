/**
 * In-memory sliding-window rate limiter for sensitive endpoints (VULN-23 mitigation)
 */
class RateLimiter {
  constructor(windowMs = 15 * 60 * 1000, maxAttempts = 5) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
    this.attempts = new Map();

    // Clean up expired entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.attempts.entries()) {
        if (now - record.firstAttempt > this.windowMs) {
          this.attempts.delete(key);
        }
      }
    }, 5 * 60 * 1000).unref();
  }

  middleware() {
    return (req, res, next) => {
      const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      const key = `${ip}`;
      const now = Date.now();

      let record = this.attempts.get(key);

      if (!record || now - record.firstAttempt > this.windowMs) {
        this.attempts.set(key, { count: 1, firstAttempt: now });
        return next();
      }

      if (record.count >= this.maxAttempts) {
        const retryAfterSeconds = Math.ceil((record.firstAttempt + this.windowMs - now) / 1000);
        res.setHeader('Retry-After', Math.max(1, retryAfterSeconds));
        return res.status(429).json({
          error: 'Too many login attempts. Your IP has been temporarily throttled. Please try again in 15 minutes.',
          retryAfter: retryAfterSeconds,
        });
      }

      record.count += 1;
      next();
    };
  }

  reset(req) {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    this.attempts.delete(`${ip}`);
  }
}

export const loginLimiter = new RateLimiter(15 * 60 * 1000, 5); // 5 attempts per 15 minutes per IP
