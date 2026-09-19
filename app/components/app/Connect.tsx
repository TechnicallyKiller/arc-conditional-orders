"use client";

import { useState } from "react";
import { useWallet } from "../../lib/wallet";
import { short } from "../../lib/chain";

const item: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", padding: "12px 14px",
  background: "transparent", border: "none", borderTop: "1px solid var(--rule)",
  color: "var(--ink)", font: "inherit", fontSize: 14, cursor: "pointer",
};

export function Connect() {
  const w = useWallet();
  const [open, setOpen] = useState(false);

  if (w.address) {
    return (
      <button
        onClick={w.disconnect}
        title={`${w.kind === "passkey" ? "Passkey smart account" : "Browser wallet"} — click to disconnect`}
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
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={w.busy}
        style={{
          height: 36, padding: "0 18px", border: "none", borderRadius: 999,
          background: "var(--ink)", color: "var(--paper)", font: "inherit",
          fontSize: 13, fontWeight: 600, cursor: w.busy ? "wait" : "pointer",
        }}
      >
        {w.busy ? "Connecting…" : "Connect"}
      </button>

      {open && (
        <div
          style={{
            position: "absolute", right: 0, top: 44, width: 296, zIndex: 40,
            border: "1px solid var(--hair)", borderRadius: 12, overflow: "hidden",
            background: "rgba(24,21,17,.96)", backdropFilter: "blur(20px)",
            boxShadow: "0 8px 24px rgba(0,0,0,.5)",
          }}
        >
          {w.passkeyAvailable ? (
            <>
              <button style={item} onClick={() => { setOpen(false); w.connectPasskey("register"); }}>
                <div style={{ fontWeight: 600 }}>Create a passkey wallet</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                  Face ID or fingerprint. No extension, no seed phrase, and gas is sponsored — you
                  need no USDC to try testnet.
                </div>
              </button>
              <button style={item} onClick={() => { setOpen(false); w.connectPasskey("login"); }}>
                <div style={{ fontWeight: 600 }}>Use an existing passkey</div>
              </button>
            </>
          ) : (
            <div style={{ ...item, cursor: "default", color: "var(--ink-3)", fontSize: 12 }}>
              Passkey wallets are unconfigured. Set <span className="num">NEXT_PUBLIC_CLIENT_KEY</span>{" "}
              from Circle Console to enable them.
            </div>
          )}

          <button style={item} onClick={() => { setOpen(false); w.connectInjected(); }}>
            <div style={{ fontWeight: 600 }}>Browser wallet</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
              MetaMask or similar. Use this if you already hold the token you want to protect.
            </div>
          </button>

          {w.error && (
            <div style={{ ...item, cursor: "default", color: "var(--brick)", fontSize: 12 }}>{w.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
