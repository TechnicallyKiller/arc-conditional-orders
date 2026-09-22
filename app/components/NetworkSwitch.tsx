"use client";

import { useNetwork, type Network } from "../lib/network";

const OPTIONS: Network[] = ["testnet", "mainnet"];

/**
 * Switching network changes which contract every page reads. It is deliberately a visible
 * control rather than an inferred one: reading a mainnet pool through the testnet RPC returns
 * nothing, and that failure previously looked like an empty pool rather than a wrong chain.
 */
export function NetworkSwitch({ compact = false }: { compact?: boolean }) {
  const { network, setNetwork } = useNetwork();

  return (
    <div
      role="group"
      aria-label="Network"
      style={{
        display: "inline-flex", padding: 2, gap: 2, borderRadius: 999,
        background: "var(--sunk)", border: "1px solid var(--hair)",
      }}
    >
      {OPTIONS.map((n) => {
        const on = n === network;
        return (
          <button
            key={n}
            type="button"
            onClick={() => setNetwork(n)}
            aria-pressed={on}
            style={{
              appearance: "none", cursor: "pointer", border: "none",
              padding: compact ? "4px 10px" : "6px 14px", borderRadius: 999,
              fontSize: compact ? 11 : 12, fontWeight: 600, letterSpacing: "0.01em",
              background: on ? (n === "mainnet" ? "var(--vermilion)" : "var(--rule-3)") : "transparent",
              color: on ? (n === "mainnet" ? "#1a1208" : "var(--ink)") : "var(--ink-3)",
              transition: "background 120ms ease, color 120ms ease",
            }}
          >
            {n === "mainnet" ? "Mainnet" : "Testnet"}
          </button>
        );
      })}
    </div>
  );
}
