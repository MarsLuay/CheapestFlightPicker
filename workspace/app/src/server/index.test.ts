import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from './index';
import fs from 'node:fs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    existsSync: vi.fn((path) => {
      // Return false specifically for the fallback index.html route to test the error condition.
      if (path.toString().includes('index.html')) {
        return false;
      }
      return actual.existsSync(path);
    }),
  };
});

describe('Server Application', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('Health Check', () => {
    it('should return ok for /api/health', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ ok: true });
    });
  });

  describe('CORS Middleware', () => {
    it('should allow configured origins', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:5173');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should fall back correctly if origin is not provided', async () => {
      const response = await request(app).options('/api/health');
      expect(response.status).toBe(204);
    });
  });

  describe('Static Web App Routes', () => {
    it('should return 503 if the web app index.html is missing', async () => {
      // The `{ *path }` catch-all route triggers this.
      const response = await request(app).get('/some-frontend-path');
      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error: 'The web app has not been built yet.',
        ok: false
      });
    });
  });

  describe('API Unknown Routes', () => {
    it('should get 503 instead of 404 because of `{ *path }` catch-all mapping', async () => {
      const response = await request(app).get('/api/unknown-route-that-does-not-exist');
      expect(response.status).toBe(503);
    });
  });

  describe('Rate Limiting Middleware', () => {
    it('should block requests exceeding the configured limit', async () => {
      // The rate limit is 240. We use a unique IP address to avoid interfering with other tests.
      const ip = '192.168.1.100';
      const batchSize = 24;

      // We send 240 requests to reach the limit
      for (let i = 0; i < 240 / batchSize; i++) {
        const batch = [];
        for (let j = 0; j < batchSize; j++) {
           batch.push(request(app).get('/').set('X-Forwarded-For', ip));
        }
        await Promise.all(batch);
      }

      // The 241st request should be blocked
      const response = await request(app).get('/').set('X-Forwarded-For', ip);
      expect(response.status).toBe(429);
      expect(response.body).toEqual({
        error: 'Too many page requests. Please slow down and try again shortly.',
        ok: false
      });
    }, 15000); // Increased timeout to 15s to allow processing of 240 requests
  });
});
