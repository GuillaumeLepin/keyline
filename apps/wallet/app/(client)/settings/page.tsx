'use client';

import { AddressBook, Question, ShieldCheck, SquaresFour } from '@phosphor-icons/react/dist/ssr';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { Segmented } from '@/src/components/Segmented';
import { copyWc, useCopy, usePrefs } from '@/src/copy';
import {
  applyThemeColor,
  COOKIE,
  CURRENCIES,
  type Currency,
  LANGS,
  type Lang,
  writeCookie,
} from '@/src/i18n/prefs';
import { Chip, InboxBadge, ProtectionRing, StatementRow, ThemeSwitch, useThemePreference } from '@/src/ui';
import { useWc } from '@/src/wc/context';

/** I1 Settings: display currency, language, appearance; links to Help and Security (DESIGN.md v2 §11 I). */
export default function SettingsPage() {
  const t = useCopy();
  const s = t.copyC.settings;
  const wcCtx = useWc();
  const { prefs, setLang, setCurrency } = usePrefs();
  const [theme, setTheme] = useThemePreference();

  return (
    <>
      <ScreenHeader title={s.title} backHref="/" />

      <section className="kl-stack gap-3" aria-labelledby="set-currency">
        {/* D-11: one chip per simulated group, at its header (§7); the note below is plain text. */}
        <h2 id="set-currency" className="kl-section__title flex items-center gap-1">
          {s.currency}
          <Chip />
        </h2>
        <Segmented<Currency>
          legend={s.currency}
          value={prefs.currency}
          onChange={setCurrency}
          testId="settings-currency"
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
        <p className="m-0 text-12 text-ink-3">
          {s.currencyNames[prefs.currency]} · {s.currencyNote}
        </p>
      </section>

      <section className="kl-stack gap-3" aria-labelledby="set-language">
        <h2 id="set-language" className="kl-section__title">
          {s.language}
        </h2>
        <Segmented<Lang>
          legend={s.language}
          value={prefs.lang}
          onChange={setLang}
          testId="settings-language"
          options={LANGS.map((l) => ({ value: l, label: s.languageNames[l], lang: l }))}
        />
      </section>

      <section className="kl-stack gap-3" aria-labelledby="set-theme">
        <h2 id="set-theme" className="kl-section__title">
          {s.appearance}
        </h2>
        <div>
          <ThemeSwitch
            full
            value={theme}
            onChange={(v) => {
              setTheme(v);
              writeCookie(COOKIE.theme, v);
              applyThemeColor(v);
            }}
          />
        </div>
      </section>

      <section aria-label={s.more}>
        <div className="kl-section">
          <h2 className="kl-section__title">{s.more}</h2>
        </div>
        <StatementRow icon={<Question size={20} aria-hidden="true" />} label={s.help} href="/help" />
        <StatementRow
          icon={<ProtectionRing state="protected" size={24} label={t.copyV2.home.protectionTitle} />}
          label={s.security}
          href="/security"
        />
        <StatementRow
          icon={<AddressBook size={20} aria-hidden="true" />}
          label={s.contacts}
          href="/contacts"
        />
        <StatementRow
          icon={<SquaresFour size={20} aria-hidden="true" />}
          label={s.apps}
          href="/dapps"
          amount={
            <InboxBadge
              count={wcCtx?.waiting.length ?? 0}
              label={copyWc.inbox.badge(wcCtx?.waiting.length ?? 0)}
            />
          }
        />
      </section>

      <p className="m-0 flex items-center gap-2 text-12 text-ink-3">
        <ShieldCheck size={16} aria-hidden="true" />
        {s.version}
      </p>
    </>
  );
}
