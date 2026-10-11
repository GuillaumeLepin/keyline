import { Check, ShieldCheck } from '@phosphor-icons/react/dist/ssr';

export type DappPermissionsCopy = {
  /** "This app will be able to:" */
  title: string;
  items: readonly string[];
  /** "It can never move money without your approval." */
  never: string;
};

export const DAPP_PERMISSIONS_COPY: DappPermissionsCopy = {
  title: 'This app will be able to:',
  items: ['See your address', 'Ask you to approve transactions', 'Ask you to sign messages'],
  never: 'It can never move money without your approval.',
};

export type DappPermissionsListProps = { copy?: Partial<DappPermissionsCopy> };

/** What connecting grants — three plain lines and the one thing it never grants. */
export function DappPermissionsList({ copy }: DappPermissionsListProps) {
  const t = { ...DAPP_PERMISSIONS_COPY, ...copy };
  return (
    <section className="kl2-perms" aria-label={t.title}>
      <p className="kl2-perms__title">{t.title}</p>
      <ul className="kl2-perms__list">
        {t.items.map((i) => (
          <li key={i}>
            <Check size={16} aria-hidden="true" />
            {i}
          </li>
        ))}
      </ul>
      <p className="kl2-perms__never">
        <ShieldCheck size={20} weight="fill" aria-hidden="true" />
        {t.never}
      </p>
    </section>
  );
}
