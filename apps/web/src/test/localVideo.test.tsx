import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createLocalVideoSource, revokeLocalVideoSource } from '../lib/localVideo.js';

describe('local video selection (Phase 3)', () => {
  const created: string[] = [];

  beforeEach(() => {
    created.length = 0;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((file: File) => {
        const url = `blob:mock/${file.name}`;
        created.push(url);
        return url;
      }),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an object URL pointing at the local file', () => {
    const file = new File(['fake-bytes'], 'movie.mp4', { type: 'video/mp4' });
    const source = createLocalVideoSource(file);
    expect(source.url).toBe('blob:mock/movie.mp4');
    expect(source.name).toBe('movie.mp4');
  });

  it('makes no network request — there is nothing to upload to', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const file = new File(['fake-bytes'], 'movie.mp4');
    createLocalVideoSource(file);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('revokes the object URL when a new file is picked', () => {
    const file = new File(['x'], 'a.mp4');
    const source = createLocalVideoSource(file);
    revokeLocalVideoSource(source.url);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock/a.mp4');
  });
});
