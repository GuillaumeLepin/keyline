/**
 * WalletConnect EN copy — the keyed object of DESIGN.md §13.6 (`copyWc` in apps/wallet/src/copy.*.ts).
 * The wallet adds FR/DE with the same keys. Functions take already-formatted values.
 */
export const copyWc = {
  nav: { apps: 'Apps', connect: 'Connect an app', connectedApps: 'Connected apps' },

  connect: {
    title: 'Connect to an app',
    body: 'On the app’s website choose WalletConnect, then copy its link or show its QR code.',
    fieldLabel: 'WalletConnect link',
    placeholder: 'wc:…',
    paste: 'Paste',
    scan: 'Scan QR code',
    stopScan: 'Stop scanning',
    connect: 'Connect',
    connecting: 'Connecting…',
    pairingLine: 'Waiting for the app to answer…',
    invalid: 'This isn’t a WalletConnect link. It starts with wc:',
    scanHint: 'Point the camera at the app’s QR code.',
    cameraDeniedTitle: 'Camera access is off',
    cameraDeniedBody: 'Paste the link instead, or allow the camera for this site in your browser settings.',
    expired: 'This link has expired. Ask the app for a new one.',
  },

  identity: { verified: 'Verified domain', unverified: 'Unverified', flagged: 'Flagged' },

  proposal: {
    title: 'Connect to this app?',
    permissions: {
      title: 'This app will be able to:',
      items: ['See your address', 'Ask you to approve transactions', 'Ask you to sign messages'],
      never: 'It can never move money without your approval.',
    },
    network: 'Network',
    networkValue: 'Base Sepolia (test network)',
    account: 'Wallet',
    unverifiedNote: 'Keyline couldn’t confirm this app’s website. Connect only if you opened it yourself.',
    flaggedTitle: 'This app’s identity could not be verified',
    flaggedBody:
      'Its website doesn’t match what it claims, or it is on a list of known scams. Keyline won’t connect to it.',
    connect: 'Connect',
    decline: 'Not now',
    close: 'Close',
    connectedTitle: 'Connected',
    connectedBody: (app: string) => `${app} can now see your address and send you requests.`,
    errorTitle: 'Not connected',
    errorBody: 'The app didn’t answer. Nothing was shared. Try again from the app.',
  },

  apps: {
    title: 'Connected apps',
    empty: 'No apps connected',
    emptyBody: 'Connect to an app from its website with WalletConnect.',
    connectedSince: (date: string) => `Connected ${date}`,
    count: (n: number) => (n === 1 ? '1 app' : `${n} apps`),
    disconnect: 'Disconnect',
    disconnectTitle: (app: string) => `Disconnect ${app}?`,
    disconnectBody:
      'The app can no longer see your address or send you requests. Past transfers stay in your statement.',
    disconnectYes: 'Disconnect',
    keep: 'Keep',
    disconnected: (app: string) => `${app} disconnected`,
    activity: 'Activity from this app',
    activityEmpty: 'Nothing yet.',
    permissionsTitle: 'What it can do',
    network: 'Network',
    lastRequest: 'Last request',
  },

  request: {
    decline: 'Not now',
    close: 'Close',
    retry: 'Try again',
    expiredTitle: 'This request expired',
    expiredBody: 'The app stopped waiting. Nothing was signed or sent. Ask the app to try again.',
    declinedToast: 'Declined. The app was told.',

    tx: {
      title: 'Approve a transaction',
      approve: 'Approve with Face ID',
      pendingLine: (step: string) => step,
      steps: {
        signed: 'Signed',
        sent: 'Sent',
        waiting: 'Waiting for the block',
        included: (block: string) => `In block ${block}`,
      },
      successTitle: 'Sent',
      successBody: 'The app has the result.',
      announce: 'Sent',
      errorTitle: 'Not sent',
      errorBody: 'Nothing left your wallet. The app was told.',
      firstTime: 'First time with this app',
    },
    batch: {
      title: 'Approve several actions',
      lead: (n: number) => `${n} actions, approved together. Either all happen or none.`,
      item: (i: number) => `Action ${i}`,
      approve: 'Approve all with Face ID',
    },
    signIn: {
      title: 'Sign in',
      approve: 'Sign in with Face ID',
      siwe: {
        title: (domain: string) => `Sign in to ${domain}`,
        as: 'as',
        validUntil: (time: string) => `Valid until ${time}`,
        noMoney: 'This does not move money.',
        mismatch: (domain: string, appHost: string) =>
          `This sign-in is for ${domain}, not for the app that asked (${appHost}). Don’t sign it.`,
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
      },
      successTitle: 'Signed in',
      successBody: 'The app has your signature. No money moved.',
      announce: 'Signed in',
    },
    message: {
      title: 'Sign a message',
      approve: 'Sign with Face ID',
      block: {
        title: 'Message',
        technical: 'Technical details',
        hexLabel: 'Raw message (hex)',
        unreadable: 'This message isn’t readable text. Only sign it if you know what it is for.',
      },
      noMoney: 'Signing a message does not move money.',
      successTitle: 'Signed',
      successBody: 'The app has your signature.',
      announce: 'Signed',
    },
    typed: {
      title: 'Sign structured data',
      approve: 'Sign with Face ID',
      domain: (name: string, network: string, contract: string) => `${name} · ${network} · ${contract}`,
      rows: {
        unlimited: 'Unlimited',
        unlimitedNote: 'No limit — the spender can take all of it, now and later.',
        never: 'Never',
        neverNote: 'This permission never expires.',
      },
      permitTitle: 'Let another address spend your tokens',
      permitBody: (spender: string) =>
        `${spender} will be able to move these tokens without asking you again.`,
      approveDanger: 'Sign anyway',
      successTitle: 'Signed',
      successBody: 'The app has your signature.',
      announce: 'Signed',
    },
    eoaOnly: {
      title: 'This signature isn’t possible',
      body: 'This token only accepts signatures from a single private key. Your Keyline is a smart account protected by 2 of 3 recoverers, so it can’t produce that kind of signature.',
      alternative: 'Approve with a transaction instead',
      alternativeBody: 'You’ll review an approval transaction instead. Swissquote pays the network fee.',
      decline: 'Not now',
    },
    chainSwitch: {
      title: 'Network not available',
      body: (network: string) =>
        `The app asked to switch to ${network}. This Keyline works on Base Sepolia only. The app was told; you can keep using it on Base Sepolia.`,
    },
    unsupported: {
      title: 'Request not supported',
      body: (method: string) =>
        `The app asked for “${method}”, which Keyline never does: it could sign something you can’t read. Nothing was signed. The app was told.`,
    },
    blocked: {
      title: 'Blocked by your limits',
      body: (reason: string) => `${reason} Nothing was signed or sent. The app was told.`,
    },
  },

  inbox: {
    badge: (n: number) => (n === 1 ? '1 request waiting' : `${n} requests waiting`),
    alertTitle: (app: string) => `${app} is waiting for you`,
    alertBody: (what: string) => `${what}. Open it to review.`,
    open: 'Review',
    expired: 'Expired',
    expiredBody: 'The app stopped waiting. Nothing was signed or sent.',
    kinds: {
      tx: 'Transaction to approve',
      batch: 'Actions to approve',
      signIn: 'Sign-in request',
      message: 'Message to sign',
      typed: 'Data to sign',
    },
  },

  security: { row: 'Connected apps', rowMeta: (n: number) => (n === 1 ? '1 app' : `${n} apps`) },
} as const;
