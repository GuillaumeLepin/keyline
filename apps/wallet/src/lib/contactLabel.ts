import type { Contact } from '@keyline/shared';
import { copyC } from '../copy';

/** A contact's display name: seeded demo contacts get the active language's label; the client's own stay as typed. */
export function contactLabel(c: Pick<Contact, 'label'>): string {
  return (copyC.seedContacts as Record<string, string>)[c.label] ?? c.label;
}
