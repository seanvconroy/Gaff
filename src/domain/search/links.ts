import { homeHref } from '@/domain/homes/home-page';

/**
 * Where a home's public page lives: what a search result opens. Every card links through this
 * one function. A home is known in search by its public reference (UX-LS-1), never an internal
 * ID.
 */
export function homePageHref(ref: string): string {
  return homeHref(ref);
}
