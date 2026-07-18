import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface PageResponse {
  url: string;
  html: string;
  headers: Record<string, string>;
  statusCode: number;
}

export function fetchPage(targetUrl: string, maxRedirects = 5): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    let currentUrl = targetUrl;
    if (!/^https?:\/\//i.test(currentUrl)) {
      currentUrl = 'https://' + currentUrl;
    }

    const nextFetch = (urlStr: string, redirectCount: number) => {
      if (redirectCount > maxRedirects) {
        return reject(new Error(`Too many redirects (max: ${maxRedirects})`));
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlStr);
      } catch (err) {
        return reject(new Error(`Invalid URL: ${urlStr}`));
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const options: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 UIAudit/1.0.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        timeout: 10000,
      };

      const req = client.get(options, (res) => {
        const { statusCode } = res;
        const headers = res.headers as Record<string, string>;

        // Handle redirects (301, 302, 303, 307, 308)
        if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
          const redirectUrl = new URL(headers.location, urlStr).toString();
          res.resume(); // consume response data to free up memory
          return nextFetch(redirectUrl, redirectCount + 1);
        }

        if (statusCode && statusCode >= 400) {
          res.resume();
          return reject(new Error(`HTTP Error ${statusCode} when fetching ${urlStr}`));
        }

        const data: Buffer[] = [];
        res.on('data', (chunk) => {
          data.push(chunk);
        });

        res.on('end', () => {
          const buffer = Buffer.concat(data);
          const html = buffer.toString('utf-8');
          resolve({
            url: urlStr,
            html,
            headers,
            statusCode: statusCode || 200,
          });
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timed out for ${urlStr}`));
      });
    };

    nextFetch(currentUrl, 0);
  });
}
