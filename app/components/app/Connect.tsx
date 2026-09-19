"use client";

import { useWallet } from "../../lib/wallet";
import { short } from "../../lib/chain";

export function Connect() {
  const w = useWallet();

  if (!w.configured) {
    return (
      <span
        title="Set NEXT_PUBLIC_PRIVY_APP_ID to enable wallet connection"
        className="label"
        style={{ padding: "8px 14px", borderRadius: 999, background: "var(--sunk)", color: "var(--ink-3)" }}
      >
        Read only
      </span>
    );
  }

  if (w.address) {
    return (
      <button
        onClick={w.disconnect}
        title="Click to disconnect"
        className="num"
        style={{
          height: 36, padding: "0 14px", border: "1px solid var(--hair)", borderRadius: 999,
          background: "transparent", color: "var(--ink)", fontSize: 12, cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: 8,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--pine)" }} />
        {short(w.address)}
      </button>
    );
  }

  return (
    <button
      onClick={w.connect}
      disabled={!w.ready}
      style={{
        height: 36, padding: "0 18px", border: "none", borderRadius: 999,
        background: "var(--ink)", color: "var(--paper)", font: "inherit",
        fontSize: 13, fontWeight: 600, cursor: w.ready ? "pointer" : "wait",
      }}
    >
      {w.ready ? "Connect" : "…"}
    </button>
  );
}
