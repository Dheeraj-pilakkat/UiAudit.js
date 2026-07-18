import { describe, it, expect, vi } from 'vitest';
import { detectTechStack } from './detector.js';

// Mock fetchPage so we don't make real network requests in unit tests
vi.mock('./utils/fetch.js', () => {
  return {
    fetchPage: vi.fn((url: string) => {
      if (url.includes('nextjs')) {
        return Promise.resolve({
          url,
          html: '<html><head><script src="https://cdn.tailwindcss.com"></script><script id="__NEXT_DATA__">{}</script></head><body><div class="flex items-center text-sm p-4">Next.js App</div></body></html>',
          headers: { 'x-powered-by': 'Next.js' },
          statusCode: 200,
        });
      }
      if (url.includes('vue')) {
        return Promise.resolve({
          url,
          html: '<html><body><div id="__nuxt">Nuxt App</div><div data-v-12345>Vue element</div></body></html>',
          headers: {},
          statusCode: 200,
        });
      }
      if (url.includes('bootstrap')) {
        return Promise.resolve({
          url,
          html: '<html><head><link rel="stylesheet" href="https://cdn.bootstrap.com/bootstrap.min.css"></head><body><div class="container"><button class="btn btn-primary">Button</button></div></body></html>',
          headers: {},
          statusCode: 200,
        });
      }
      if (url.includes('shopify')) {
        return Promise.resolve({
          url,
          html: '<html><body>Shopify Site</body></html>',
          headers: { 'x-shopify-stage': 'production' },
          statusCode: 200,
        });
      }
      return Promise.resolve({
        url,
        html: '<html><body>Plain Site</body></html>',
        headers: {},
        statusCode: 200,
      });
    }),
  };
});

describe('detectTechStack', () => {
  it('should detect Next.js, React, and Tailwind CSS', async () => {
    const result = await detectTechStack('https://nextjs-site.com');
    expect(result.statusCode).toBe(200);
    
    const techNames = result.technologies.map(t => t.name);
    expect(techNames).toContain('Next.js');
    expect(techNames).toContain('React');
    expect(techNames).toContain('Tailwind CSS');
  });

  it('should detect Vue.js and Nuxt.js', async () => {
    const result = await detectTechStack('https://vue-site.com');
    expect(result.statusCode).toBe(200);
    
    const techNames = result.technologies.map(t => t.name);
    expect(techNames).toContain('Vue.js');
    expect(techNames).toContain('Nuxt.js');
  });

  it('should detect Bootstrap', async () => {
    const result = await detectTechStack('https://bootstrap-site.com');
    expect(result.statusCode).toBe(200);
    
    const techNames = result.technologies.map(t => t.name);
    expect(techNames).toContain('Bootstrap');
  });

  it('should detect Shopify from headers', async () => {
    const result = await detectTechStack('https://shopify-site.com');
    expect(result.statusCode).toBe(200);
    
    const techNames = result.technologies.map(t => t.name);
    expect(techNames).toContain('Shopify');
  });
});
