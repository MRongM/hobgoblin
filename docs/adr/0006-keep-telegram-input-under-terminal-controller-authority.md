# Keep Telegram input under terminal controller authority

Telegram terminal input must not create a synthetic attachment, take over a session, or bypass the existing terminal ownership model. The primary workspace renderer may mark its genuinely focused controlling attachment as the runtime-only Telegram target, and the terminal worker atomically revalidates that the same attachment still controls the running session before placing one Telegram submission on the ordinary input queue; if that authority is gone, delivery fails without selecting another terminal. This preserves one input-authority model at the cost of requiring a focused controller before remote input can work.

## Considered options

Using renderer-selected terminal state would allow stale restored selection to route input without current authority. Creating a Telegram-owned attachment or taking over the terminal would compete with the user's controller. Writing directly from the polling runtime would establish a second authority model outside the terminal worker. Retaining the existing controlling attachment as the only write authority keeps routing consistent with local input and makes stale targets fail closed.

## Consequences

The renderer sends only a focus intent, and the socket boundary supplies its actual attachment identity. The terminal worker owns the ephemeral target, clears it when controller eligibility changes, and revalidates it for every submission. Telegram input never restores a target, selects a fallback, creates a terminal, or takes over control; users must focus a controlling main-window terminal at least once per application run.
