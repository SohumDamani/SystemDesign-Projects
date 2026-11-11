// One place to set the page title and the description search engines and link previews read.
const SITE = 'System Design Lab';
const DEFAULT_DESCRIPTION = 'Learn system design by running it. Every classic interview question with the math, the code, and a lab you can tweak and break.';

function setContent(selector: string, content: string) {
  document.head.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content);
}

/** Sets the tab title and the description. Pass no title for the home page. */
export function setMeta(title?: string, description = DEFAULT_DESCRIPTION) {
  const full = title ? `${title} | ${SITE}` : SITE;
  document.title = full;
  setContent('meta[name="description"]', description);
  setContent('meta[property="og:title"]', full);
  setContent('meta[property="og:description"]', description);
}
