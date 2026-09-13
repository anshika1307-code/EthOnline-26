#!/usr/bin/env node
/**
 * Fills the gateway slugs into recipe.template.json and checks the result
 * against the rules `baz recipe --help` prints (CLI 0.10.1), so a bad file
 * fails here with a clear message rather than at `baz recipe create`.
 *
 *   TESTNET_MIRROR_SLUG=... node integrations/bazantic/build-recipe.mjs
 *   baz recipe create integrations/bazantic/recipe.json --json
 *
 * Get the slugs from `baz gateway list --json`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SLUG = /^[a-z2-7]{26}$/; // 26-char lowercase RFC 4648 base32
const KEYS = ['name', 'description', 'input_schema', 'input_example', 'output_example', 'prompt_template', 'model', 'tool_bindings'];
const MODELS = [
  'anthropic/claude-haiku-4.5',
  'anthropic/claude-sonnet-4.6',
  'anthropic/claude-opus-5',
  'meta/llama-3.1-8b',
  'deepseek/deepseek-v4-flash-0731',
  'openai/gpt-5-nano',
];

export function build(template, env) {
  const errors = [];
  const filled = template.replace(/\$\{(\w+)\}/g, (_, name) => {
    const v = (env[name] ?? '').trim();
    if (!SLUG.test(v)) errors.push(`${name} must be a 26-character lowercase base32 gateway slug, got "${v}"`);
    return v;
  });
  if (errors.length) return { errors: [...new Set(errors)] };

  const r = JSON.parse(filled);
  const keys = Object.keys(r).sort();
  if (keys.join() !== [...KEYS].sort().join()) errors.push(`keys must be exactly ${KEYS.join(', ')}; got ${keys.join(', ')}`);
  if (!r.name?.trim() || r.name.length > 200) errors.push('name must be 1-200 characters');
  if (!r.description?.trim() || r.description.length > 4096) errors.push(`description must be 1-4096 characters (is ${r.description?.length})`);
  if ((r.prompt_template.match(/\{\{inputs\}\}/g) ?? []).length !== 1) errors.push('prompt_template needs exactly one {{inputs}}');
  if (!MODELS.includes(r.model)) errors.push(`model must be one of ${MODELS.join(', ')}`);
  const b = r.tool_bindings ?? [];
  if (b.length < 1 || b.length > 64) errors.push('tool_bindings must have 1-64 entries');
  const seen = new Set(b.map((x) => `${x.gateway_slug}/${x.tool_name}`));
  if (seen.size !== b.length) errors.push('tool_bindings must be unique');
  for (const x of b) {
    if (Object.keys(x).sort().join() !== 'gateway_slug,tool_name') errors.push(`binding has extra keys: ${JSON.stringify(x)}`);
  }
  for (const req of r.input_schema.required ?? []) {
    if (!(req in r.input_example)) errors.push(`input_example is missing required "${req}"`);
  }
  const bytes = Buffer.byteLength(JSON.stringify(r), 'utf8');
  if (bytes > 24 * 1024) errors.push(`compact JSON is ${bytes} bytes, limit is 24 KiB`);
  return { errors, recipe: r, bytes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { errors, recipe, bytes } = build(readFileSync(join(here, 'recipe.template.json'), 'utf8'), process.env);
  if (errors.length) {
    console.error(errors.map((e) => `✗ ${e}`).join('\n'));
    process.exit(1);
  }
  writeFileSync(join(here, 'recipe.json'), JSON.stringify(recipe, null, 2) + '\n');
  console.log(`✓ wrote integrations/bazantic/recipe.json (${bytes} bytes compact, ${recipe.tool_bindings.length} bindings, ${recipe.model})`);
}
