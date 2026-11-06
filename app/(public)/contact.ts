/** Where the landing page's main action writes to, by Orel's choice (7 November 2026). */
export const CONTACT_EMAIL = "oreltahirov@gmail.com";

export function mailHref(subject: string) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
