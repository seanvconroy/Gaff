/**
 * UX-RN-21: "Download a copy". The tenancy agreement as one file a tenant can keep, open on any
 * phone or computer, and print: a plain web page with nothing loaded from anywhere. It holds
 * exactly what the agreement page shows, signatures included, and nothing else.
 */
export interface AgreementFile {
  title: string;
  sections: ReadonlyArray<{ heading: string; paragraphs: readonly string[] }>;
  /** Who signed, when, in words. Left out until someone has. */
  signatures: readonly string[];
}

const escapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => escapes[char]!);
}

/** A file name a phone can save: "Tenancy agreement - 12 Ranelagh Road.html". */
export function agreementFileName(address: string): string {
  const plain = address.replace(/[^\p{L}\p{N} .,'-]/gu, '').trim() || 'your home';
  return `Tenancy agreement - ${plain}.html`;
}

export function agreementFile(agreement: AgreementFile): string {
  const sections = agreement.sections
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs
          .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
          .join('')}</section>`,
    )
    .join('\n');
  const signatures =
    agreement.signatures.length > 0
      ? `<section class="signatures">${agreement.signatures
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join('')}</section>`
      : '';
  return `<!doctype html>
<html lang="en-IE">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(agreement.title)}</title>
<style>
body { max-width: 68ch; margin: 2rem auto; padding: 0 1rem; font: 16px/1.5 system-ui, sans-serif; color: #131a2a; }
h1 { font-size: 1.5rem; line-height: 1.25; }
h2 { font-size: 1.125rem; margin-top: 2rem; }
.signatures { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #848c9b; }
</style>
</head>
<body>
<h1>${escapeHtml(agreement.title)}</h1>
${sections}
${signatures}
</body>
</html>
`;
}
