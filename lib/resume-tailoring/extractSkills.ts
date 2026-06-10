import { getSupabaseServiceClient } from '@/lib/supabase/client';
import { inMemoryDb, type SkillTaxonomyRecord } from '@/lib/supabase/inMemoryDb';

let taxonomyCache: SkillTaxonomyRecord[] | null = null;

function taxonomy(): SkillTaxonomyRecord[] {
  return taxonomyCache ?? [...inMemoryDb.skillTaxonomy.values()];
}

export function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  return taxonomy()
    .filter((entry) => entry.aliases.some((alias) => new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i').test(lower)))
    .map((entry) => entry.canonical_name);
}

export async function loadSkillTaxonomy(): Promise<void> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return;

  const { data } = await supabase.from('skill_taxonomy').select('id, canonical_name, aliases, category, created_at');
  if (data && data.length > 0) {
    taxonomyCache = data as SkillTaxonomyRecord[];
  }
}

export function setSkillTaxonomyCache(entries: SkillTaxonomyRecord[] | null): void {
  taxonomyCache = entries;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
