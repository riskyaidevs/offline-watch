import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/app.js';
import { DEFAULT_HOST, DEFAULT_PORT } from '../src/config.js';

describe('HTTP layer (Phase 1)', () => {
  let app: ReturnType<typeof buildServer> | null = null;
  let staticDir: string | null = null;

  beforeEach(() => {
    staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-static-'));
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<!doctype html><title>fw</title>');
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
    if (staticDir) {
      fs.rmSync(staticDir, { recursive: true, force: true });
      staticDir = null;
    }
  });

  it('default config binds 0.0.0.0:8443, not loopback-only', () => {
    // Participants connect from other devices on the hotspot.
    expect(DEFAULT_HOST).toBe('0.0.0.0');
    expect(DEFAULT_PORT).toBe(8443);
  });

  it('serves the SPA HTML', async () => {
    app = buildServer({ staticDir: staticDir! });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>fw</title>');
  });

  it('SPA fallback serves index.html for unknown GET paths', async () => {
    app = buildServer({ staticDir: staticDir! });
    const res = await app.inject({ method: 'GET', url: '/?room=ABCD' });
    expect(res.statusCode).toBe(200);
  });

  it('has no upload endpoint — videos are never transmitted', async () => {
    app = buildServer({ staticDir: staticDir! });
    for (const method of ['POST', 'PUT'] as const) {
      const res = await app.inject({ method, url: '/upload', payload: {} });
      expect(res.statusCode).toBe(404);
    }
  });

  it('API-shaped paths 404 even with GET', async () => {
    app = buildServer({ staticDir: staticDir! });
    const res = await app.inject({ method: 'GET', url: '/api/upload' });
    expect(res.statusCode).toBe(404);
  });
});
