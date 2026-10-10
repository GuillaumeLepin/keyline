/**
 * Strings for the v2 proposal page (/design) and its five hero mocks. Phase B moves the product
 * strings into apps/wallet/src/copy.ts (EN now; FR/DE later). Rules: client's side, second person,
 * no exclamation marks, no "Oops", no "seamless". Mocked values are labelled with <Chip/>.
 */
export const page = {
  title: 'Keyline — design v2',
  thesis: 'A Swiss bank document that moves like a watch.',
  status:
    'Approved (DECISIONS #26–#28). Phase B: links are ink, dark danger is a cooler crimson, journey primitives below. The v1 kitchen sink is at /design/v1.',
  nav: { ring: 'Ring', journey: 'Journey', motion: 'Motion', screens: 'Screens', tokens: 'Tokens' },
  theme: 'Appearance',
  ring: {
    title: 'The protection ring',
    lead: 'One motif, drawn once in SVG. Three arcs, one per recoverer, clockwise from 12 o’clock: Safety key, Emergency card, Swissquote. It is the onboarding progress, the home indicator, the recovery countdown and the receipt’s success state.',
    play: 'Play the Protect sequence',
    replay: 'Play again',
    sequence: [
      'Waiting for the signature',
      'Safety key registered on-chain',
      'Emergency card registered on-chain',
      'Swissquote registered on-chain',
      'Protected · 2 of 3 recoverers',
    ],
    demoNote:
      'On this page a demo timer stands in for the on-chain events. In the app each arc waits for its event.',
    states: {
      empty: 'Empty',
      r1: '1 registered',
      r2: '2 registered',
      r3: '3 registered',
      protected: 'Protected (closed)',
      counting: 'Counting',
      success: 'Success',
      revoked: 'Revoked',
    },
    sizes: 'Sizes 24 · 64 · 200',
  },
  motion: {
    title: 'Motion',
    lead: 'One spring for movement (stiffness 420, damping 40: about 200 ms, no overshoot), one curve for opacity and colour (180 ms). Nothing animates for its own sake. With reduced motion, everything cross-fades or jumps.',
    stack: 'Stack navigation',
    stackNote: 'The header stays; its title cross-fades. The content slides on the spring.',
    sheet: 'Sheet',
    sheetNote: 'The scrim fades, the panel rises on the spring. Drag down, Escape or the scrim close it.',
    openSheet: 'Why can’t I move Bitcoin?',
    ticker: 'Number ticker',
    tickerNote: 'Amounts roll digit by digit. Separators and the currency code never move.',
    receive: 'Receive 120.00 USDC',
    send: 'Send 25.00 USDC',
    crossfade: 'Skeleton to content',
    crossfadeNote: 'The skeleton has the content’s exact shape, so nothing jumps when it cross-fades.',
    reload: 'Load again',
    action: 'Primary button',
    actionNote:
      'Pressed, loading (the label stays), success (the label folds, a check draws in 220 ms, a short vibration).',
    actionIdle: 'Idle',
    actionLoading: 'Loading',
    actionSuccess: 'Success',
    actionDisabled: 'Disabled',
    chip: 'SIMULATED chip',
    chipNote:
      'Quiet, dashed, no fill, inline after the value it qualifies. Hover or focus it for the tooltip.',
  },
  screens: {
    title: 'Five screens',
    lead: 'Static data, real copy. Values that are mocked in the prototype carry the chip.',
    portfolio: '1 · Swissquote web — portfolio (laptop)',
    protect: '2 · Onboarding — Protect my wallet',
    home: '3 · Home',
    review: '4 · Review',
    countdown: '5 · Recovery — waiting period',
    playProtect: 'Play the Protect sequence',
    lastSeconds: 'Run the last 5 seconds',
    resetReview: 'Reset',
  },
  tokens: {
    title: 'Tokens',
    lead: 'Light is v1, unchanged. Dark is designed: warm graphite paper, lifted hairlines, the accent lifted in luminance, a faint glow on the ring only. Ratios are measured live against the page background.',
    type: 'Type',
  },
} as const;

export const sqWeb = {
  brand: 'Swissquote',
  url: 'sq-web.localhost/portfolio',
  nav: ['Portfolio', 'Trade', 'Payments', 'Documents'],
  client: 'Lea Keller · Account 4821 3307',
  signOut: 'Sign out',
  title: 'Portfolio',
  valuation: 'Valuation 10 Oct 2026, 17:30',
  total: 'Total value',
  cash: 'Cash',
  invested: 'Invested',
  cols: { position: 'Position', quantity: 'Quantity', price: 'Price', value: 'Value' },
  groups: { cash: 'Cash', securities: 'Securities', crypto: 'Crypto' },
  move: 'Move to Keyline',
  why: 'Why?',
  keyline: {
    eyebrow: 'Keyline',
    title: 'A wallet only you can spend from',
    body: 'Your phone holds the key. Any 2 of your 3 recoverers can restore access: your Safety key, your Emergency card and Swissquote. Swissquote can’t move your money, alone or with anyone.',
    scan: 'Scan with your phone’s camera, or open keyline.app/start and type this code:',
    code: '482 137',
    expires: 'Code expires in 4:52',
    waiting: 'Waiting for your phone',
  },
} as const;

export const btcWhy = {
  title: 'Why can’t I move Bitcoin?',
  body: [
    'Keyline only moves an asset it can protect the same way as the rest of your wallet: your phone signs, and any 2 of your 3 recoverers can restore access after a waiting period.',
    'Bitcoin can do this too, but it needs a different tool: a threshold key or a timelocked script. That is on our roadmap.',
    'Until then your Bitcoin stays in your Swissquote account, where it is today.',
  ],
  link: 'Roadmap: Bitcoin',
  close: 'Close',
} as const;

export const protect = {
  device: 'Lea · phone',
  stepper: 'Step 5 of 6 · Protect my wallet',
  title: 'One signature protects your wallet',
  titleDone: 'Protected',
  body: 'Your wallet is created on Base and your three recoverers are written into it. Swissquote pays the network fee.',
  bodyDone:
    'Your phone key signs. Any 2 of your 3 recoverers can restore access. Swissquote can’t move your money, alone or with anyone.',
  rows: [
    { name: 'Safety key', where: 'On your laptop' },
    { name: 'Emergency card', where: 'On paper, with you' },
    { name: 'Swissquote', where: 'Swiss data centre' },
  ],
  ringSub: 'recoverers added',
  waiting: 'Waiting',
  adding: 'Adding',
  added: 'Added',
  cta: 'Protect my wallet',
  ctaDone: 'Continue',
  fee: 'Network fee paid by Swissquote',
  block: (n: string) => `In block ${n}`,
} as const;

export const home = {
  device: 'Lea · phone',
  brand: 'Keyline',
  protectedLink: 'Protected',
  settings: 'Settings',
  balance: 'Balance',
  rate: '1 USDC = CHF 0.80',
  send: 'Send',
  receive: 'Receive',
  topUp: 'Top up',
  statement: 'Statement',
  all: 'All',
  rows: [
    { label: 'Lukas Meier', meta: '10 Oct, 14:32', amount: -25, status: 'Confirmed' },
    { label: 'Top up from Swissquote', meta: '10 Oct, 14:20', amount: 120, status: 'Confirmed' },
  ],
  sq: 'In your Swissquote account',
  sqOpen: 'Open',
  testnet: 'Test network · Base Sepolia — nothing here is real money.',
} as const;

export const review = {
  device: 'Lea · phone',
  title: 'Review',
  to: 'to Lukas Meier',
  policy: { word: 'Approved', reason: 'Within your CHF 1’000 daily limit.' },
  panel: 'What will happen',
  rows: {
    send: 'You send',
    receives: 'Lukas receives',
    balance: 'Your balance',
    fee: 'Network fee',
    feeValue: 'Paid by Swissquote',
    screening: 'Sanctions check',
    screeningValue: 'Clear · OFAC, SECO',
  },
  footnote: 'This can’t be undone.',
  details: 'Technical details',
  cta: 'Confirm with Face ID',
  sent: 'Sent',
  receiptTitle: 'Transfer',
  receiptLine: 'to Lukas Meier',
  steps: ['Signed', 'Sent', 'In block 6’812’334', 'Confirmed'],
  done: 'Done',
} as const;

export const countdown = {
  device: 'Lea · new phone',
  stepper: 'Step 5 of 5 · Waiting period',
  title: (t: string) => `Access restores at ${t}`,
  caption: 'Waiting period accelerated for the demo: 3 min instead of 72 h.',
  body: 'During this period the previous owner can still cancel. If nobody cancels, this phone becomes the only key.',
  rows: [
    { name: 'Swissquote', state: 'Confirmed 14:30:12' },
    { name: 'Safety key', state: 'Confirmed 14:31:40' },
    { name: 'Emergency card', state: 'Not needed' },
  ],
  confirmedAt: (t: string) => `Confirmed ${t}`,
  watch: 'Watch on Basescan',
  done: 'Ready to finish',
} as const;

// ---- Phase B journey copy, mirrored verbatim from docs/DESIGN.md Appendix V2 (copy.ts keys). ----
// The wallet's copy.ts owns the product strings; these copies feed the /design journey lab only.

export const sqWebShell = {
  brand: 'Swissquote',
  prototype: 'Prototype of Swissquote web — simulated',
  navLabel: 'Swissquote',
  signOut: 'Sign out',
} as const;

export const sqNav = [
  { label: 'Portfolio', href: '#journey', current: true },
  { label: 'Trade', href: '#journey' },
  { label: 'Payments', href: '#journey' },
  { label: 'Documents', href: '#journey' },
];

export const sqPositionsCopy = {
  caption: 'Positions',
  position: 'Position',
  quantity: 'Quantity',
  price: 'Price',
  value: 'Value',
  action: 'Keyline',
  total: 'Total value',
} as const;

export const sqTileCopy = {
  eyebrow: 'Keyline',
  title: 'A wallet only you can spend from',
  body: 'Your phone holds the key. Any 2 of your 3 recoverers can restore access: your Safety key, your Emergency card and Swissquote. Swissquote can’t move your money, alone or with anyone.',
  start: 'Set up Keyline on my phone',
  scan: 'Scan with your phone’s camera, or open keyline.app/start and type this code:',
  qrLabel: 'QR code to continue on your phone',
  expiresIn: (clock: string) => `Code expires in ${clock}`,
  waiting: 'Waiting for your phone',
  expired: 'Code expired',
  renew: 'Show a new code',
  claimed: 'Phone connected',
  claimedBody: 'Continue on your phone. This page updates by itself.',
  protectedTitle: 'Protected · 2 of 3 recoverers',
};

export const sqSafetyKeyCopy = {
  context: 'Request from your phone',
  title: 'Make this computer your Safety key?',
  body: 'Your phone is setting up Keyline. This computer keeps a second key in this browser. It co-approves large transfers and can help restore access if you lose your phone.',
  canTitle: 'It can',
  can: ['Approve large transfers with your phone', 'Help restore access, with one other recoverer'],
  cannotTitle: 'It can’t',
  cannot: ['Spend on its own', 'Be used from another computer'],
  confirm: 'Make this computer my Safety key',
  decline: 'Not now',
  confirmed: 'Safety key added',
  doneTitle: 'This computer is your Safety key',
  doneBody: 'Continue on your phone. Keep this browser profile: clearing its data removes the key.',
  alreadyTitle: 'This computer is already your Safety key',
  alreadyBody: 'Nothing to do here. Continue on your phone.',
  errorTitle: 'The Safety key wasn’t added.',
  errorBody: 'Nothing changed on your wallet. Try again.',
  retry: 'Try again',
} as const;

export const btcPolicyCopy = {
  title: 'The same protection, written as a Bitcoin script',
  description:
    'Two ways to spend. Your key can spend at any time. After the waiting period, any 2 of your 3 recoverers (Safety key, Emergency card, Swissquote) can move the Bitcoin to a new key.',
  branch1: 'Your key, now',
  branch1Code: 'pk(owner)',
  or: 'or',
  branch2: 'After the waiting period:',
  branch2Count: '2 of 3 recoverers',
  recoverers: 'Safety key · Emergency card · Swissquote',
  branch2Code: 'and(older(waiting), thresh(2, …))',
  axisNow: 'Now',
  axisWait: 'Waiting period ends',
  axisTime: 'time',
} as const;

export const journeyLab = {
  title: 'Journey primitives',
  lead: 'Phase B building blocks for the Swissquote web → phone journey. Every state, both themes. Data is static.',
  webShell: 'WebShell + PositionsTable',
  tile: 'HandoffTile',
  confirm: 'ConfirmPrompt',
  assets: 'AssetRow',
  travel: 'TravelRuleLine',
  diagram: 'BitcoinPolicyDiagram',
  states: {
    idle: 'Idle',
    starting: 'Starting',
    waiting: 'Waiting',
    expired: 'Expired',
    claimed: 'Claimed',
    protected: 'Protected',
    ask: 'Ask',
    confirming: 'Confirming',
    done: 'Done',
    already: 'Already',
    error: 'Error',
  },
  btcWhyTitle: 'Why can’t I move Bitcoin?',
  btcWhy:
    'Keyline moves an asset only when it can give it the same protection: your key, two of three recoverers, a public waiting period. For Bitcoin that needs a different key design (a threshold key or a timelocked script), which is on our roadmap. Until then your Bitcoin stays in your Swissquote account.',
  btcReason: 'Not movable yet',
  move: 'Move to Keyline',
  back: 'Back to Swissquote',
  balance: 'Wallet balance',
} as const;
