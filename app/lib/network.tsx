"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PublicClient } from "viem";
import { DEPLOY } from "./data";
import { clientFor } from "./clients";

export type Network = "mainnet" | "testnet";

export type NetworkInfo = {
  id: Network;
  label: string;
  chainId: number;
  orderBook: `0x${string}`;
  swapAdapter: `0x${string}`;
  explorer: string;
  /**
   * The faucet token and its seeded pool exist only on testnet, on purpose. Mainnet holds the
   * real capped deployment against real Uniswap v4 pools, so there is nothing to hand out.
   */
  hasDemo: boolean;
  note: string;
};

export const NETWORKS: Record<Network, NetworkInfo> = {
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    chainId: DEPLOY.mainnetChainId,
    orderBook: DEPLOY.mainnetOrderBook as `0x${string}`,
    swapAdapter: DEPLOY.mainnetSwapAdapter as `0x${string}`,
    explorer: "https://explorer.arc.io",
    hasDemo: false,
    note: "Real USDC. Exposure capped on-chain at 10 USDC per fill and 100 USDC cumulative.",
  },
  testnet: {
    id: "testnet",
    label: "Testnet",
    chainId: DEPLOY.chainId,
    orderBook: DEPLOY.orderBook as `0x${string}`,
    swapAdapter: DEPLOY.swapAdapter as `0x${string}`,
    explorer: "https://explorer.testnet.arc.io",
    hasDemo: true,
    note: "Sandbox. The demo token is worthless by design and its pool price is scripted.",
  },
};

type Ctx = { network: Network; info: NetworkInfo; client: PublicClient; setNetwork: (n: Network) => void };

const NetworkContext = createContext<Ctx | null>(null);

const KEY = "arc-network";

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  // Default to testnet: it is the one with something to interact with. A visitor who wants the
  // real deployment can switch, and the choice is remembered.
  const [network, setNetworkState] = useState<Network>("testnet");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY);
      if (saved === "mainnet" || saved === "testnet") setNetworkState(saved);
    } catch {
      // Private windows and blocked site data both throw here. The default stands.
    }
  }, []);

  const setNetwork = (n: Network) => {
    setNetworkState(n);
    try {
      window.localStorage.setItem(KEY, n);
    } catch {
      // Not being able to remember the choice is not a reason to refuse making it.
    }
  };

  const value = useMemo<Ctx>(
    () => ({ network, info: NETWORKS[network], client: clientFor(network), setNetwork }),
    [network]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): Ctx {
  const c = useContext(NetworkContext);
  if (!c) throw new Error("useNetwork must be used inside <NetworkProvider>");
  return c;
}
