import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync('src/App.jsx', 'utf8');

describe('public homepage routes', () => {
  it('keeps the original public homepage at / and redirects /home to it', () => {
    expect(appSource).toContain('<Route path="/" element={renderRoute(PublicHome, <PageLoader />)} />');
    expect(appSource).toContain('<Route path="/home" element={<Navigate to="/" replace />} />');
  });
});
