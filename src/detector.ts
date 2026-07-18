import { fetchPage } from './utils/fetch.js';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface TechMatch {
  name: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
}

export interface DetectionResult {
  url: string;
  title: string;
  statusCode: number;
  technologies: TechMatch[];
  headers: Record<string, string>;
}

// ─── Detection Rules ─────────────────────────────────────────────────────────

interface Rule {
  name: string;
  category: 'Frameworks' | 'UI & Styling' | 'CMS & E-commerce' | 'Analytics & Ads' | 'Hosting & CDN' | 'Utilities & Fonts';
  detect: (html: string, headers: Record<string, string>) => { matched: boolean; confidence?: 'high' | 'medium' | 'low'; evidence?: string } | null;
}

const RULES: Rule[] = [
  // ─── Frameworks & Libraries ────────────────────────────────────────────────
  {
    name: 'Next.js',
    category: 'Frameworks',
    detect: (html, headers) => {
      if (headers['x-powered-by'] && /next\.js/i.test(headers['x-powered-by'])) {
        return { matched: true, confidence: 'high', evidence: 'Header: x-powered-by: Next.js' };
      }
      if (headers['x-nextjs-cache'] !== undefined) {
        return { matched: true, confidence: 'high', evidence: 'Header: x-nextjs-cache' };
      }
      if (html.includes('id="__NEXT_DATA__"') || html.includes('<script id="__NEXT_DATA__"')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains <script id="__NEXT_DATA__">' };
      }
      if (/_next\/static/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTML references /_next/static/ assets' };
      }
      return null;
    }
  },
  {
    name: 'React',
    category: 'Frameworks',
    detect: (html) => {
      if (html.includes('data-reactroot')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains "data-reactroot" attribute' };
      }
      if (html.includes('id="__NEXT_DATA__"') || html.includes('window.__remixContext') || html.includes('id="___gatsby"')) {
        return { matched: true, confidence: 'high', evidence: 'React-based framework (Next.js/Remix/Gatsby) detected' };
      }
      // Look for typical react chunk scripts or library script tags
      if (/(react|react-dom)\.(production|development|min)\.js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'React/React-DOM JS file match in scripts' };
      }
      return null;
    }
  },
  {
    name: 'Vue.js',
    category: 'Frameworks',
    detect: (html) => {
      if (html.includes('__VUE__') || html.includes('data-v-')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Vue attributes (data-v-) or Vue globals' };
      }
      if (html.includes('id="__nuxt"') || html.includes('window.__NUXT__')) {
        return { matched: true, confidence: 'high', evidence: 'Vue-based framework (Nuxt.js) detected' };
      }
      if (/vue(\.global)?(\.prod)?\.js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'Vue script matched in source' };
      }
      return null;
    }
  },
  {
    name: 'Nuxt.js',
    category: 'Frameworks',
    detect: (html) => {
      if (html.includes('window.__NUXT__') || html.includes('id="__nuxt"')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Nuxt entry point or state' };
      }
      if (/_nuxt\//i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTML references /_nuxt/ assets' };
      }
      return null;
    }
  },
  {
    name: 'Angular',
    category: 'Frameworks',
    detect: (html) => {
      if (html.includes('ng-version') || /ng-version=/i.test(html)) {
        const match = html.match(/ng-version="([^"]+)"/i);
        const versionInfo = match ? ` (v${match[1]})` : '';
        return { matched: true, confidence: 'high', evidence: `HTML contains "ng-version" attribute${versionInfo}` };
      }
      if (/_nghost-/i.test(html) || /_ngcontent-/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Angular component scoping attributes' };
      }
      if (/angular(\.min)?\.js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'Angular script matched in source' };
      }
      return null;
    }
  },
  {
    name: 'Svelte',
    category: 'Frameworks',
    detect: (html) => {
      if (/class="[a-zA-Z0-9-_\s]*svelte-[a-zA-Z0-9]+/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Svelte component CSS classes' };
      }
      return null;
    }
  },
  {
    name: 'SolidJS',
    category: 'Frameworks',
    detect: (html) => {
      if (html.includes('window._$HY') || html.includes('_solid-')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains SolidJS hydration keys or attributes' };
      }
      return null;
    }
  },
  {
    name: 'Remix',
    category: 'Frameworks',
    detect: (html) => {
      if (html.includes('window.__remixContext')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains window.__remixContext' };
      }
      return null;
    }
  },
  {
    name: 'Gatsby',
    category: 'Frameworks',
    detect: (html) => {
      if (html.includes('id="___gatsby"') || html.includes('gatsby-image-wrapper')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Gatsby root element or classes' };
      }
      return null;
    }
  },
  {
    name: 'Astro',
    category: 'Frameworks',
    detect: (html) => {
      if (/data-astro-cid-/i.test(html) || /<style astro-/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Astro compiler attributes' };
      }
      return null;
    }
  },
  {
    name: 'jQuery',
    category: 'Frameworks',
    detect: (html) => {
      if (/jquery(\.min)?\.js/i.test(html)) {
        const match = html.match(/jquery-([0-9.]+)/i);
        const versionInfo = match ? ` (v${match[1]})` : '';
        return { matched: true, confidence: 'high', evidence: `jQuery script loaded${versionInfo}` };
      }
      if (html.includes('$.fn.jquery') || html.includes('jQuery.fn.')) {
        return { matched: true, confidence: 'medium', evidence: 'HTML script contents contain jQuery keywords' };
      }
      return null;
    }
  },
  {
    name: 'Alpine.js',
    category: 'Frameworks',
    detect: (html) => {
      if (/x-data=/i.test(html) || /x-init=/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Alpine.js directives (x-data)' };
      }
      if (/alpine(\.min)?\.js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'Alpine.js script matched in source' };
      }
      return null;
    }
  },
  {
    name: 'HTMX',
    category: 'Frameworks',
    detect: (html) => {
      if (/hx-[a-z]+=/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains HTMX custom attributes (hx-*)' };
      }
      if (/htmx(\.min)?\.js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTMX script loaded' };
      }
      return null;
    }
  },

  // ─── UI & Styling ──────────────────────────────────────────────────────────
  {
    name: 'Tailwind CSS',
    category: 'UI & Styling',
    detect: (html) => {
      if (/tailwind/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'Tailwind CSS referenced in HTML scripts/links' };
      }
      // Count tailwind utility classes
      const classAttrMatches = html.match(/class="([^"]+)"/g) || [];
      let tailwindClassCount = 0;
      const tailwindRegex = /^(flex|grid|relative|absolute|items-center|justify-|text-|bg-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|rounded-|shadow-|hover:|focus:|md:|lg:|xl:|sm:)/;
      
      for (const match of classAttrMatches) {
        const classes = match.slice(7, -1).split(/\s+/);
        for (const cls of classes) {
          if (tailwindRegex.test(cls)) {
            tailwindClassCount++;
          }
        }
      }

      if (tailwindClassCount > 25) {
        return { matched: true, confidence: 'high', evidence: `Detected high density of Tailwind CSS utility classes (${tailwindClassCount} classes)` };
      } else if (tailwindClassCount > 10) {
        return { matched: true, confidence: 'medium', evidence: `Detected Tailwind CSS utility classes (${tailwindClassCount} classes)` };
      }
      return null;
    }
  },
  {
    name: 'Bootstrap',
    category: 'UI & Styling',
    detect: (html) => {
      if (/bootstrap(\.min)?\.css/i.test(html)) {
        const match = html.match(/bootstrap\/([0-9.]+)/i);
        const versionInfo = match ? ` (v${match[1]})` : '';
        return { matched: true, confidence: 'high', evidence: `Bootstrap stylesheet loaded${versionInfo}` };
      }
      if (/bootstrap(\.min)?\.js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'Bootstrap script loaded' };
      }
      if (html.includes('btn-primary') && (html.includes('col-md-') || html.includes('container-fluid'))) {
        return { matched: true, confidence: 'medium', evidence: 'HTML contains standard Bootstrap classes (btn-primary, col-*)' };
      }
      return null;
    }
  },
  {
    name: 'Material-UI (MUI)',
    category: 'UI & Styling',
    detect: (html) => {
      if (html.includes('MuiButton-root') || html.includes('MuiTypography-root') || html.includes('MuiSvgIcon-root')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Material-UI class names (Mui*)' };
      }
      if (html.includes('data-meta="Mui') || html.includes('<style data-meta="')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains MUI styled meta tags' };
      }
      return null;
    }
  },
  {
    name: 'Styled Components',
    category: 'UI & Styling',
    detect: (html) => {
      if (html.includes('data-styled') || html.includes('data-styled-components')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains styled-components meta/style tags' };
      }
      return null;
    }
  },
  {
    name: 'Emotion',
    category: 'UI & Styling',
    detect: (html) => {
      if (html.includes('data-emotion') || html.includes('data-emotion-css')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Emotion style elements' };
      }
      return null;
    }
  },
  {
    name: 'Bulma',
    category: 'UI & Styling',
    detect: (html) => {
      if (/bulma(\.min)?\.css/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'Bulma stylesheet loaded' };
      }
      if (html.includes('is-primary') && html.includes('has-text-') && html.includes('columns')) {
        return { matched: true, confidence: 'medium', evidence: 'HTML contains Bulma helper and layout classes' };
      }
      return null;
    }
  },
  {
    name: 'Foundation',
    category: 'UI & Styling',
    detect: (html) => {
      if (/foundation(\.min)?\.css/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'Foundation CSS loaded' };
      }
      if (html.includes('small-') && html.includes('medium-') && html.includes('columns')) {
        return { matched: true, confidence: 'medium', evidence: 'HTML contains Foundation column classes' };
      }
      return null;
    }
  },

  // ─── CMS & E-commerce ──────────────────────────────────────────────────────
  {
    name: 'WordPress',
    category: 'CMS & E-commerce',
    detect: (html, headers) => {
      if (headers['x-pingback'] && /xmlrpc\.php/i.test(headers['x-pingback'])) {
        return { matched: true, confidence: 'high', evidence: 'Header x-pingback points to WordPress endpoint' };
      }
      if (headers['link'] && /wp-json/i.test(headers['link'])) {
        return { matched: true, confidence: 'high', evidence: 'Header Link points to wp-json API' };
      }
      if (html.includes('/wp-content/') || html.includes('/wp-includes/')) {
        return { matched: true, confidence: 'high', evidence: 'HTML references /wp-content/ or /wp-includes/ folders' };
      }
      if (/<meta name="generator" content="WordPress/i.test(html)) {
        const match = html.match(/content="WordPress\s*([^"]+)"/i);
        const versionInfo = match ? ` (v${match[1]})` : '';
        return { matched: true, confidence: 'high', evidence: `WordPress generator meta tag found${versionInfo}` };
      }
      return null;
    }
  },
  {
    name: 'Shopify',
    category: 'CMS & E-commerce',
    detect: (html, headers) => {
      if (Object.keys(headers).some(k => k.startsWith('x-shopify'))) {
        return { matched: true, confidence: 'high', evidence: 'Response headers contain x-shopify attributes' };
      }
      if (html.includes('cdn.shopify.com') || html.includes('Shopify.theme') || html.includes('Shopify.shop')) {
        return { matched: true, confidence: 'high', evidence: 'HTML references Shopify CDN, global scripts, or API config' };
      }
      if (/<meta name="shopify-decoding/i.test(html) || html.includes('name="shopify-checkout-api-token"')) {
        return { matched: true, confidence: 'high', evidence: 'Shopify metadata or api checkout tokens found' };
      }
      return null;
    }
  },
  {
    name: 'WooCommerce',
    category: 'CMS & E-commerce',
    detect: (html) => {
      if (html.includes('/plugins/woocommerce/') || html.includes('woocommerce-') || html.includes('wc-block')) {
        return { matched: true, confidence: 'high', evidence: 'HTML references WooCommerce plugin assets or classes' };
      }
      return null;
    }
  },
  {
    name: 'Wix',
    category: 'CMS & E-commerce',
    detect: (html) => {
      if (/<meta name="generator" content="Wix.com/i.test(html) || html.includes('static.wixstatic.com')) {
        return { matched: true, confidence: 'high', evidence: 'Wix generator meta tag or wixstatic assets found' };
      }
      if (html.includes('wix-image') || html.includes('wix-ads')) {
        return { matched: true, confidence: 'high', evidence: 'Wix layout modules detected' };
      }
      return null;
    }
  },
  {
    name: 'Squarespace',
    category: 'CMS & E-commerce',
    detect: (html) => {
      if (/<meta name="generator" content="Squarespace/i.test(html) || html.includes('Squarespace.bundle')) {
        return { matched: true, confidence: 'high', evidence: 'Squarespace generator meta tag or JavaScript bundles found' };
      }
      if (html.includes('squarespace.com/static/') || html.includes('static1.squarespace.com')) {
        return { matched: true, confidence: 'high', evidence: 'HTML references Squarespace static assets' };
      }
      return null;
    }
  },
  {
    name: 'Webflow',
    category: 'CMS & E-commerce',
    detect: (html) => {
      if (html.includes('data-wf-page') || html.includes('data-wf-site') || html.includes('webflow.js')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Webflow page/site attributes or Webflow script' };
      }
      return null;
    }
  },
  {
    name: 'HubSpot',
    category: 'CMS & E-commerce',
    detect: (html) => {
      if (html.includes('js.hs-scripts.com') || html.includes('hs-script-loader') || html.includes('HubSpotConversations')) {
        return { matched: true, confidence: 'high', evidence: 'HTML loads HubSpot tracker/widget script' };
      }
      return null;
    }
  },
  {
    name: 'Ghost',
    category: 'CMS & E-commerce',
    detect: (html) => {
      if (/<meta name="generator" content="Ghost/i.test(html) || html.includes('ghost-sdk.js')) {
        return { matched: true, confidence: 'high', evidence: 'Ghost generator meta tag or Ghost SDK script found' };
      }
      return null;
    }
  },

  // ─── Analytics & Ads ───────────────────────────────────────────────────────
  {
    name: 'Google Tag Manager',
    category: 'Analytics & Ads',
    detect: (html) => {
      if (/googletagmanager\.com\/gtm\.js/i.test(html) || html.includes('gtm.start')) {
        return { matched: true, confidence: 'high', evidence: 'HTML loads Google Tag Manager script' };
      }
      return null;
    }
  },
  {
    name: 'Google Analytics',
    category: 'Analytics & Ads',
    detect: (html) => {
      if (/google-analytics\.com\/analytics\.js/i.test(html) || /googletagmanager\.com\/gtag\/js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTML loads Google Analytics / Google tag' };
      }
      if (html.includes('gtag(\'config\'') || html.includes('ga(\'create\'') || /UA-[0-9]+-[0-9]+/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Google Analytics tracker setup or UA tracking code' };
      }
      return null;
    }
  },
  {
    name: 'Mixpanel',
    category: 'Analytics & Ads',
    detect: (html) => {
      if (html.includes('cdn.mxpnl.com') || html.includes('mixpanel.init')) {
        return { matched: true, confidence: 'high', evidence: 'HTML contains Mixpanel script or initialization' };
      }
      return null;
    }
  },
  {
    name: 'Amplitude',
    category: 'Analytics & Ads',
    detect: (html) => {
      if (html.includes('amplitude.run') || html.includes('amplitude.getInstance')) {
        return { matched: true, confidence: 'high', evidence: 'HTML loads Amplitude analytics tracking scripts' };
      }
      return null;
    }
  },
  {
    name: 'Hotjar',
    category: 'Analytics & Ads',
    detect: (html) => {
      if (html.includes('static.hotjar.com') || html.includes('hj.q')) {
        return { matched: true, confidence: 'high', evidence: 'HTML loads Hotjar user feedback/recording scripts' };
      }
      return null;
    }
  },
  {
    name: 'Facebook Pixel',
    category: 'Analytics & Ads',
    detect: (html) => {
      if (html.includes('connect.facebook.net') && html.includes('fbq(')) {
        return { matched: true, confidence: 'high', evidence: 'HTML loads Facebook Pixel SDK' };
      }
      return null;
    }
  },
  {
    name: 'Segment',
    category: 'Analytics & Ads',
    detect: (html) => {
      if (html.includes('cdn.segment.com/analytics.js')) {
        return { matched: true, confidence: 'high', evidence: 'HTML loads Segment API script' };
      }
      return null;
    }
  },
  {
    name: 'Plausible Analytics',
    category: 'Analytics & Ads',
    detect: (html) => {
      if (html.includes('plausible.io/js/script.js') || /plausible\.js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTML loads Plausible analytics scripts' };
      }
      return null;
    }
  },
  {
    name: 'Fathom Analytics',
    category: 'Analytics & Ads',
    detect: (html) => {
      if (html.includes('cdn.usefathom.com')) {
        return { matched: true, confidence: 'high', evidence: 'HTML loads Fathom tracking scripts' };
      }
      return null;
    }
  },

  // ─── Hosting & CDN ─────────────────────────────────────────────────────────
  {
    name: 'Vercel',
    category: 'Hosting & CDN',
    detect: (html, headers) => {
      if (headers['x-vercel-id'] !== undefined) {
        return { matched: true, confidence: 'high', evidence: 'Header: x-vercel-id' };
      }
      if (headers['x-vercel-cache'] !== undefined) {
        return { matched: true, confidence: 'high', evidence: 'Header: x-vercel-cache' };
      }
      if (headers['via'] && /\bvc\b/i.test(headers['via'])) {
        return { matched: true, confidence: 'high', evidence: 'Header: via has vc (Vercel)' };
      }
      return null;
    }
  },
  {
    name: 'Netlify',
    category: 'Hosting & CDN',
    detect: (html, headers) => {
      if (headers['server'] && /netlify/i.test(headers['server'])) {
        return { matched: true, confidence: 'high', evidence: 'Header: server: Netlify' };
      }
      if (headers['x-nf-request-id'] !== undefined) {
        return { matched: true, confidence: 'high', evidence: 'Header: x-nf-request-id' };
      }
      return null;
    }
  },
  {
    name: 'Cloudflare',
    category: 'Hosting & CDN',
    detect: (html, headers) => {
      if (headers['server'] && /cloudflare/i.test(headers['server'])) {
        return { matched: true, confidence: 'high', evidence: 'Header: server: cloudflare' };
      }
      if (headers['cf-ray'] !== undefined) {
        return { matched: true, confidence: 'high', evidence: 'Header: cf-ray' };
      }
      if (headers['cf-cache-status'] !== undefined) {
        return { matched: true, confidence: 'high', evidence: 'Header: cf-cache-status' };
      }
      return null;
    }
  },
  {
    name: 'AWS CloudFront',
    category: 'Hosting & CDN',
    detect: (html, headers) => {
      if (headers['via'] && /cloudfront/i.test(headers['via'])) {
        return { matched: true, confidence: 'high', evidence: 'Header: via contains CloudFront' };
      }
      if (headers['x-amz-cf-id'] !== undefined || headers['x-amz-cf-pop'] !== undefined) {
        return { matched: true, confidence: 'high', evidence: 'Header: x-amz-cf-* (AWS CloudFront)' };
      }
      if (headers['x-cache'] && /cloudfront/i.test(headers['x-cache'])) {
        return { matched: true, confidence: 'high', evidence: 'Header: x-cache indicates CloudFront' };
      }
      return null;
    }
  },
  {
    name: 'GitHub Pages',
    category: 'Hosting & CDN',
    detect: (html, headers) => {
      if (headers['server'] && /github\.com/i.test(headers['server'])) {
        return { matched: true, confidence: 'high', evidence: 'Header: server: GitHub.com' };
      }
      return null;
    }
  },
  {
    name: 'Fastly',
    category: 'Hosting & CDN',
    detect: (html, headers) => {
      if (headers['via'] && /fastly/i.test(headers['via'])) {
        return { matched: true, confidence: 'high', evidence: 'Header: via contains Fastly' };
      }
      if (Object.keys(headers).some(k => k.startsWith('x-fastly'))) {
        return { matched: true, confidence: 'high', evidence: 'Response headers contain x-fastly attributes' };
      }
      return null;
    }
  },

  // ─── Utilities & Fonts ─────────────────────────────────────────────────────
  {
    name: 'Google Fonts',
    category: 'Utilities & Fonts',
    detect: (html) => {
      if (html.includes('fonts.googleapis.com') || html.includes('fonts.gstatic.com')) {
        return { matched: true, confidence: 'high', evidence: 'HTML references Google Fonts stylesheet or domains' };
      }
      return null;
    }
  },
  {
    name: 'Font Awesome',
    category: 'Utilities & Fonts',
    detect: (html) => {
      if (/font-awesome/i.test(html) || /fontawesome/i.test(html) || /use\.fontawesome\.com/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'HTML stylesheet/script references Font Awesome' };
      }
      if (/fa-[a-z-]+/i.test(html) && (html.includes('fa-solid') || html.includes('fa-regular') || html.includes('fa-brands'))) {
        return { matched: true, confidence: 'medium', evidence: 'HTML templates contain Font Awesome icon classes (fa-*)' };
      }
      return null;
    }
  },
  {
    name: 'Lodash',
    category: 'Utilities & Fonts',
    detect: (html) => {
      if (/lodash(\.min)?\.js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'Lodash JavaScript package loaded' };
      }
      return null;
    }
  },
  {
    name: 'Axios',
    category: 'Utilities & Fonts',
    detect: (html) => {
      if (/axios(\.min)?\.js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'Axios JavaScript package loaded' };
      }
      return null;
    }
  },
  {
    name: 'Three.js',
    category: 'Utilities & Fonts',
    detect: (html) => {
      if (/three(\.min)?\.js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'Three.js 3D library loaded' };
      }
      return null;
    }
  },
  {
    name: 'D3.js',
    category: 'Utilities & Fonts',
    detect: (html) => {
      if (/d3(\.min)?\.js/i.test(html)) {
        return { matched: true, confidence: 'high', evidence: 'D3.js visualization library loaded' };
      }
      return null;
    }
  }
];

// ─── Main Detector Engine ────────────────────────────────────────────────────

export async function detectTechStack(url: string): Promise<DetectionResult> {
  const page = await fetchPage(url);
  
  // Extract title tag
  let title = '';
  const titleMatch = page.html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  const matches: TechMatch[] = [];

  for (const rule of RULES) {
    try {
      const match = rule.detect(page.html, page.headers);
      if (match && match.matched) {
        matches.push({
          name: rule.name,
          category: rule.category,
          confidence: match.confidence || 'high',
          evidence: match.evidence || 'Pattern match',
        });
      }
    } catch (e) {
      // Ignore individual rule errors
    }
  }

  return {
    url: page.url,
    title,
    statusCode: page.statusCode,
    technologies: matches,
    headers: page.headers,
  };
}
