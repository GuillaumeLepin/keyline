import { ShieldCheck, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { Address } from '../../components/Address';

export type SiweSummaryCopy = {
  /** "Sign in to {domain}" — receives the domain. */
  title: (domain: string) => string;
  /** "as" (before the address) */
  as: string;
  /** "Valid until {time}" */
  validUntil: (time: string) => string;
  /** "This does not move money." */
  noMoney: string;
  /** "The sign-in is for {domain}, not for the app that asked ({appHost})." */
  mismatch: (domain: string, appHost: string) => string;
  fields: {
    statement: string;
    domain: string;
    address: string;
    network: string;
    issued: string;
    expires: string;
    nonce: string;
    uri: string;
  };
};

export const SIWE_SUMMARY_COPY: SiweSummaryCopy = {
  title: (d) => `Sign in to ${d}`,
  as: 'as',
  validUntil: (t) => `Valid until ${t}`,
  noMoney: 'This does not move money.',
  mismatch: (d, h) => `This sign-in is for ${d}, not for the app that asked (${h}). Don’t sign it.`,
  fields: {
    statement: 'Statement',
    domain: 'Domain',
    address: 'Address',
    network: 'Network',
    issued: 'Issued',
    expires: 'Expires',
    nonce: 'Nonce',
    uri: 'URI',
  },
};

export type SiweSummaryProps = {
  domain: string;
  address: string;
  /** Preformatted (`formatDateTime`). Omitted → no "Valid until" line. */
  expiresAt?: string;
  issuedAt?: string;
  statement?: string;
  network?: string;
  nonce?: string;
  uri?: string;
  /** Host of the app that asked; when it differs from `domain` the summary warns instead of reassuring. */
  appHost?: string;
  copy?: Partial<Omit<SiweSummaryCopy, 'fields'>> & { fields?: Partial<SiweSummaryCopy['fields']> };
};

/**
 * Sign-In with Ethereum (EIP-4361) read as one sentence — "Sign in to app.example as 0x12AB…9F3C" —
 * with the validity, the reassurance that it moves no money, and every field below on the statement
 * grid. If the message's domain is not the requesting app's host, the reassurance becomes a danger line.
 */
export function SiweSummary({
  domain,
  address,
  expiresAt,
  issuedAt,
  statement,
  network,
  nonce,
  uri,
  appHost,
  copy,
}: SiweSummaryProps) {
  const t = { ...SIWE_SUMMARY_COPY, ...copy, fields: { ...SIWE_SUMMARY_COPY.fields, ...copy?.fields } };
  const mismatch = appHost !== undefined && appHost.toLowerCase() !== domain.toLowerCase();
  const rows: [string, string | undefined, boolean?][] = [
    [t.fields.statement, statement],
    [t.fields.domain, domain, true],
    [t.fields.network, network],
    [t.fields.issued, issuedAt],
    [t.fields.expires, expiresAt],
    [t.fields.nonce, nonce, true],
    [t.fields.uri, uri, true],
  ];
  return (
    <section className="kl2-siwe">
      <p className="kl2-siwe__title">{t.title(domain)}</p>
      <p className="kl2-siwe__as">
        <span>{t.as}</span>
        <Address value={address} copy={false} />
      </p>
      {expiresAt ? <p className="kl2-siwe__valid">{t.validUntil(expiresAt)}</p> : null}
      {mismatch ? (
        <p className="kl2-siwe__line kl2-siwe__line--danger" role="alert">
          <WarningCircle size={20} weight="fill" aria-hidden="true" />
          {t.mismatch(domain, appHost as string)}
        </p>
      ) : (
        <p className="kl2-siwe__line">
          <ShieldCheck size={20} weight="fill" aria-hidden="true" />
          {t.noMoney}
        </p>
      )}
      <dl className="kl2-siwe__fields">
        {rows
          .filter(([, v]) => v)
          .map(([k, v, mono]) => (
            <div key={k} className="kl2-siwe__field">
              <dt>{k}</dt>
              <dd className={mono ? 'kl2-typed__mono' : undefined}>{v}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
