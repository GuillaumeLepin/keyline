import { ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import { Disclosure } from '../../components/States';

export type MessageBlockCopy = {
  /** "Message" */
  title: string;
  /** "Technical details" */
  technical: string;
  /** "Raw message (hex)" */
  hexLabel: string;
  /** Shown instead of the text when the bytes are not readable text: "This message isn’t readable text." */
  unreadable: string;
};

export const MESSAGE_BLOCK_COPY: MessageBlockCopy = {
  title: 'Message',
  technical: 'Technical details',
  hexLabel: 'Raw message (hex)',
  unreadable: 'This message isn’t readable text. Only sign it if you know what it is for.',
};

export type MessageBlockProps = {
  /** UTF-8 text, or undefined when the bytes are not printable. */
  text?: string;
  hex: string;
  copy?: Partial<MessageBlockCopy>;
  /** Reassurance under the message, e.g. "Signing a message does not move money." */
  noMoney?: string;
};

/** A `personal_sign` message as the person will read it; the raw hex is one tap away, never first. */
export function MessageBlock({ text, hex, copy, noMoney }: MessageBlockProps) {
  const t = { ...MESSAGE_BLOCK_COPY, ...copy };
  return (
    <section className="kl2-msg" aria-label={t.title}>
      <p className="kl2-msg__title">{t.title}</p>
      {text ? (
        <p className="kl2-msg__text">{text}</p>
      ) : (
        <p className="kl2-msg__text kl2-msg__text--unreadable">{t.unreadable}</p>
      )}
      {noMoney ? (
        <p className="kl2-siwe__line">
          <ShieldCheck size={20} weight="fill" aria-hidden="true" />
          {noMoney}
        </p>
      ) : null}
      <Disclosure summary={t.technical}>
        <span>{t.hexLabel}</span>
        <code className="kl2-msg__hex">{hex}</code>
      </Disclosure>
    </section>
  );
}
