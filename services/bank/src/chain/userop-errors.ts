// Plain-language reasons for failed userOps (Phase D). Two sources:
//  - included but `success: false` → the EntryPoint's revert data from the bundler receipt (`reason`), decoded with viem;
//  - rejected by the bundler on send → its JSON-RPC message, whose ERC-4337 "AAxx" code is mapped to a short sentence.
// The raw code / data stay available for the "Technical details" disclosure.
import { decodeErrorResult, type Hex, parseAbi } from 'viem';

export const GENERIC_REVERT = 'The transfer reverted on-chain';

/** ERC-4337 EntryPoint v0.7 validation codes → client copy. */
export const AA_REASONS: Record<string, string> = {
  AA10: 'This wallet was already created — refresh and try again.',
  AA13: 'Your wallet could not be created on-chain.',
  AA20: 'This wallet is not deployed yet.',
  AA21: "The network fee couldn't be paid — Swissquote's sponsorship did not cover it.",
  AA22: 'This approval expired before it reached the network — try again.',
  AA23: 'Your wallet refused the request while checking it.',
  AA24: "The passkey signature doesn't match this wallet.",
  AA25: 'This transaction was already sent or is out of order — try again.',
  AA31: "Swissquote's fee sponsor is out of funds right now.",
  AA32: "Swissquote's fee sponsorship expired — try again.",
  AA33: "Swissquote's fee sponsor declined this transaction.",
  AA34: "Swissquote's fee sponsorship signature is invalid — try again.",
  AA40: 'The network fee limits are too low for this transaction.',
  AA41: 'The network fee limits are too low for this transaction.',
  AA51: 'The network fee limits are too low for this transaction.',
};

export type FailureReason = { reason: string; code?: string };

/** Bundler rejection message → `{ reason, code }`. Unknown messages keep a generic sentence plus no code. */
export const mapBundlerError = (message: string): FailureReason => {
  const match = /\b(AA\d{2})\b/.exec(message);
  const code = match?.[1];
  if (code) return { code, reason: AA_REASONS[code] ?? 'The network refused this transaction.' };
  if (/nonce/i.test(message)) return { reason: AA_REASONS.AA25 as string };
  if (/gas|fee/i.test(message)) return { reason: 'The network fee limits are too low for this transaction.' };
  return { reason: 'The network refused this transaction.' };
};

const revertAbi = parseAbi([
  'error Error(string message)',
  'error Panic(uint256 code)',
  // OpenZeppelin v5 ERC-20 custom errors
  'error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)',
  'error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)',
  'error ERC20InvalidReceiver(address receiver)',
  'error ERC20InvalidSender(address sender)',
  'error ERC20InvalidApprover(address approver)',
  'error ERC20InvalidSpender(address spender)',
  // Safe4337Module: the Safe's inner call returned false (ERC-20 error data is not forwarded)
  'error ExecutionFailed()',
]);

/** Well-known `Error(string)` messages (Circle FiatToken, OZ v4) → client copy. */
const STRING_REASONS: [RegExp, string][] = [
  [/exceeds balance|insufficient balance/i, 'Not enough funds in your wallet for this transfer.'],
  [/exceeds allowance|insufficient allowance/i, 'The app is not allowed to spend that much.'],
  [/blacklisted/i, 'The token issuer has blocked this address.'],
  [/paused/i, 'The token issuer has paused transfers.'],
  [/to the zero address|invalid receiver/i, 'The recipient address is not valid.'],
];

/** EntryPoint revert data (receipt `reason`) → plain sentence. Never throws. */
export const decodeRevertReason = (data: Hex | string | null | undefined): FailureReason => {
  if (!data || data === '0x') return { reason: GENERIC_REVERT };
  try {
    const decoded = decodeErrorResult({ abi: revertAbi, data: data as Hex });
    switch (decoded.errorName) {
      case 'ERC20InsufficientBalance':
        return { reason: 'Not enough funds in your wallet for this transfer.', code: decoded.errorName };
      case 'ERC20InsufficientAllowance':
        return { reason: 'The app is not allowed to spend that much.', code: decoded.errorName };
      case 'ERC20InvalidReceiver':
      case 'ERC20InvalidSender':
      case 'ERC20InvalidApprover':
      case 'ERC20InvalidSpender':
        return { reason: 'The recipient address is not valid.', code: decoded.errorName };
      case 'Error': {
        const msg = String(decoded.args?.[0] ?? '');
        const hit = STRING_REASONS.find(([re]) => re.test(msg));
        return { reason: hit ? hit[1] : GENERIC_REVERT, code: msg ? `Error(${msg})` : 'Error' };
      }
      case 'Panic':
        return { reason: GENERIC_REVERT, code: `Panic(${String(decoded.args?.[0] ?? '')})` };
      default:
        return { reason: GENERIC_REVERT, code: decoded.errorName };
    }
  } catch {
    return { reason: GENERIC_REVERT, code: data.slice(0, 10) };
  }
};
