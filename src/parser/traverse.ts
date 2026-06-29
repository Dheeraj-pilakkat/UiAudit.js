/**
 * @babel/traverse has a well-known CommonJS interop quirk.
 * Depending on the Node version and moduleResolution settings,
 * the default export may land on `.default` or on the module itself.
 * This file normalises that into a single reliable `traverse` export.
 *
 * All auditors import traverse from HERE, not directly from @babel/traverse.
 */

import _traverse from '@babel/traverse';

export const traverse = ((typeof (_traverse as any).default === 'function'
  ? (_traverse as any).default
  : _traverse) as any) as (ast: any, visitors: any) => any;