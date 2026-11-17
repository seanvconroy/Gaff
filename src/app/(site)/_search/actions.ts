'use server';

import { redirect } from 'next/navigation';
import { searchFromWords } from '@/server/search/search';

/**
 * UX-SR-3: the search box. The words become the search's address and are let go: they are not
 * stored, logged or put in the address (UX-SR-11, UX-SR-12).
 */
export async function searchWords(formData: FormData): Promise<void> {
  const { href } = searchFromWords({
    words: formData.get('words') ?? '',
    rent: formData.get('rent') ?? undefined,
  });
  redirect(href);
}
