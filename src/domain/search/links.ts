/**
 * Where a home's public page lives: what a search result opens. That page is work package
 * WP-20 ("A home's page"); every card links through this one function, so pointing search at
 * the page's real address is a change here and nowhere else.
 */
export function homePageHref(lettingId: string): string {
  return `/homes/${lettingId}`;
}
