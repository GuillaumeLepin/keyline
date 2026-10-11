// @keyline/ui — tokens live in ./tokens.css, component styles in ./components.css
// (apps/wallet/app/globals.css imports both). Everything below is typed React with no runtime CSS-in-JS.

export { ADDRESS_LABELS, Address, type AddressLabels, type AddressProps } from './components/Address';
export { AmountField, type AmountFieldProps } from './components/AmountField';
export { Button, type ButtonProps, type ButtonVariant } from './components/Button';
export {
  DESK_LABELS,
  type DeskLabels,
  DeskLayout,
  type DeskLayoutProps,
  DeskLegend,
  type DeskNavItem,
  DeviceBar,
  type DeviceBarProps,
  PERSONA_LABEL,
  type Persona,
  PhoneFrame,
  type PhoneFrameProps,
  TestnetStrip,
  type TestnetStripProps,
} from './components/Chrome';
export { RadioCard, type RadioCardProps, Toggle, type ToggleProps } from './components/Controls';
export { CountdownRing, type CountdownRingProps } from './components/CountdownRing';
export {
  EMERGENCY_CARD_LABELS,
  EMERGENCY_CARD_SENTENCE,
  EmergencyCard,
  type EmergencyCardLabels,
  type EmergencyCardProps,
} from './components/EmergencyCard';
export { KeyCard, type KeyCardProps, type KeyCardStatus } from './components/KeyCard';
export { Panel, type PanelProps, type PanelRow } from './components/Panel';
export { PolicyLine, type PolicyLineProps, type PolicyVerdict } from './components/PolicyLine';
export { Sheet, type SheetProps } from './components/Sheet';
export { SIMULATED_TOOLTIP, SimulatedBadge, type SimulatedBadgeProps } from './components/SimulatedBadge';
export { StatementRow, type StatementRowProps, type StatementRowStatus } from './components/StatementRow';
export {
  Disclosure,
  type DisclosureProps,
  EmptyState,
  type EmptyStateProps,
  ErrorState,
  type ErrorStateProps,
  Note,
  type NoteProps,
  Skeleton,
  type SkeletonProps,
} from './components/States';
export {
  StatusSequence,
  type StatusSequenceProps,
  type StatusStep,
  type StatusStepState,
} from './components/StatusSequence';
export { Stepper, type StepperProps } from './components/Stepper';
export { TextField, type TextFieldProps } from './components/TextField';

export {
  formatCHF,
  formatClock,
  formatDateTime,
  formatDuration,
  formatInteger,
  formatRate,
  formatRelative,
  formatShortDateTime,
  formatSignedUSDC,
  formatUSDC,
  groupHex,
  shortAddress,
} from './format';

// ---- v2 (docs/DESIGN.md v2) — additive; styles in ./v2/v2.css (`@keyline/ui/v2.css`) ----
export { ActionButton, type ActionButtonProps, type ActionStatus } from './v2/ActionButton';
export { CHIP_SIMULATED_TOOLTIP, Chip, type ChipProps } from './v2/Chip';
export { CrossFade, type CrossFadeProps } from './v2/CrossFade';
export { contrastRatio, luminance } from './v2/color';
export { type HapticKind, haptic } from './v2/haptics';
// ---- v2 journey primitives (DESIGN.md v2 §10.1, SPEC §10) ----
export { AssetRow, type AssetRowProps } from './v2/journey/AssetRow';
export {
  type BitcoinPolicyCopy,
  BitcoinPolicyDiagram,
  type BitcoinPolicyDiagramProps,
} from './v2/journey/BitcoinPolicyDiagram';
export {
  ConfirmPrompt,
  type ConfirmPromptCopy,
  type ConfirmPromptProps,
  type ConfirmPromptState,
} from './v2/journey/ConfirmPrompt';
export {
  type HandoffState,
  HandoffTile,
  type HandoffTileCopy,
  type HandoffTileProps,
} from './v2/journey/HandoffTile';
export { expiryClock, formatCode6, splitCode6, spokenCode6 } from './v2/journey/handoff';
export {
  type Position,
  type PositionGroup,
  PositionsTable,
  type PositionsTableCopy,
  type PositionsTableProps,
} from './v2/journey/PositionsTable';
export { RowAction, type RowActionProps } from './v2/journey/RowAction';
export {
  TRAVEL_RULE_OWN_WALLET,
  TravelRuleLine,
  type TravelRuleLineProps,
} from './v2/journey/TravelRuleLine';
export {
  type WebLinkProps,
  type WebNavItem,
  WebShell,
  type WebShellCopy,
  type WebShellProps,
} from './v2/journey/WebShell';
export { DRAW, DURATION, dampingRatio, EASE_STANDARD, FADE, INSTANT, SPRING } from './v2/motion';
export { NumberTicker, type NumberTickerProps } from './v2/NumberTicker';
export { ProtectionCountdown, type ProtectionCountdownProps } from './v2/ProtectionCountdown';
export {
  DrawnCheck,
  ProtectionRing,
  type ProtectionRingProps,
  type ProtectionRingState,
} from './v2/ProtectionRing';
export { QrCode, type QrCodeProps } from './v2/QrCode';
export { motionOrInstant, useReducedMotion } from './v2/reduced-motion';
export {
  arcAngles,
  arcLength,
  arcPath,
  circlePath,
  RECOVERER_LABEL,
  RECOVERERS,
  type Recoverer,
  RING_SIZES,
  type RingSpec,
  ringSpec,
} from './v2/ring-geometry';
export { SheetV2, type SheetV2Props } from './v2/SheetV2';
export { StackView, type StackViewProps } from './v2/StackView';
export {
  type ThemePreference,
  ThemeSwitch,
  type ThemeSwitchProps,
  useThemePreference,
} from './v2/ThemeSwitch';
export { type TickerCell, tickerCells } from './v2/ticker';

// ---- v2 WalletConnect primitives (DESIGN.md §13, SPEC §11.4) ----
export * from './v2/wc';
