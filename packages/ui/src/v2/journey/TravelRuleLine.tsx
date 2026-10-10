import { ShieldCheck } from '@phosphor-icons/react/dist/ssr';

export const TRAVEL_RULE_OWN_WALLET = 'No ownership check needed: this wallet is verified as yours.';

export type TravelRuleLineProps = {
  /** Default: "No ownership check needed: this wallet is verified as yours." */
  text?: string;
};

/**
 * The Travel Rule line for transfers between Lea's own Swissquote account and her attested Keyline
 * wallet (both directions). Icon + sentence; the icon is in --ok because the check is satisfied.
 */
export function TravelRuleLine({ text = TRAVEL_RULE_OWN_WALLET }: TravelRuleLineProps) {
  return (
    <p className="kl2-travel">
      <ShieldCheck size={20} weight="fill" aria-hidden="true" className="kl2-travel__icon" />
      <span>{text}</span>
    </p>
  );
}
