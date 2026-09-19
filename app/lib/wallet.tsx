"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { createPublicClient, createWalletClient, custom, type Hex } from "viem";
import { arc, arcTestnet } from "viem/chains";
import { PrivyProvider, usePrivy, useWallets } from "@privy-io/react-auth";
import { MIN_MAX_FEE_PER_GAS } from "./gas";

export type Call = { to: Hex; data: Hex; value?: bigint };

type Ctx = {
  address: Hex | null;
  ready: boolean;
  configured: boolean;
  connect: () => void;
  disconnect: () => void;
  /** One path for embedded and external wallets alike. Returns the last transaction hash. */
  send: (calls: Call[]) => Promise<Hex>;
};

const WalletCtx = createContext<Ctx | null>(null);
export const useWallet = () => {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
};

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

function Inner({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();

  const wallet = wallets[0] ?? null;
  const address = (wallet?.address as Hex) ?? (user?.wallet?.address as Hex) ?? null;

  const send = useCallback(async (calls: Call[]): Promise<Hex> => {
    if (!wallet) throw new Error("no wallet connected");
    await wallet.switchChain(arcTestnet.id);
    const provider = await wallet.getEthereumProvider();

    const walletClient = createWalletClient({ account: address!, chain: arcTestnet, transport: custom(provider) });
    const pub = createPublicClient({ chain: arcTestnet, transport: custom(provider) });

    let last: Hex = "0x" as Hex;
    for (const c of calls) {
      last = await walletClient.sendTransaction({
        to: c.to, data: c.data, value: c.value ?? 0n,
        // Arc's mempool discards anything under 20 Gwei silently: no receipt, no error, and the
        // wallet simply appears to do nothing.
        maxFeePerGas: MIN_MAX_FEE_PER_GAS, maxPriorityFeePerGas: 0n, chain: arcTestnet,
      });
      await pub.waitForTransactionReceipt({ hash: last, confirmations: 1 });
    }
    return last;
  }, [wallet, address]);

  const value: Ctx = useMemo(() => ({
    address: authenticated ? address : null,
    ready,
    configured: true,
    connect: login,
    disconnect: logout,
    send,
  }), [ready, authenticated, address, login, logout, send]);

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

/** Without an app id the app still runs read-only, rather than crashing on a missing key. */
function Unconfigured({ children }: { children: React.ReactNode }) {
  const value: Ctx = {
    address: null, ready: true, configured: false,
    connect: () => {}, disconnect: () => {},
    send: async () => { throw new Error("NEXT_PUBLIC_PRIVY_APP_ID is not set"); },
  };
  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  if (!APP_ID) return <Unconfigured>{children}</Unconfigured>;
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        defaultChain: arcTestnet,
        supportedChains: [arcTestnet, arc],
        // Email and social produce an embedded wallet; external covers MetaMask and
        // WalletConnect, which is what someone already holding the token will use.
        loginMethods: ["email", "wallet", "google"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        appearance: {
          theme: "dark",
          accentColor: "#FF6B3D",
          logo: undefined,
          walletChainType: "ethereum-only",
        },
      }}
    >
      <Inner>{children}</Inner>
    </PrivyProvider>
  );
}
