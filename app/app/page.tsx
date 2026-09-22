"use client";

import { useEffect, useState } from "react";
import { Atmosphere } from "../components/Atmosphere";
import { OrderCard } from "../components/app/OrderCard";
import { Rail } from "../components/app/Rail";
import { Markets } from "../components/app/Markets";
import { Create } from "../components/app/Create";
import { Proof } from "../components/app/Proof";
import { Connect } from "../components/app/Connect";
import { WalletProvider } from "../lib/wallet";
import { readKeeper, type KeeperStatus } from "../lib/keeper";
import { defaultMarketFor } from "../lib/markets";
import { useNetwork } from "../lib/network";
import { logsClientFor } from "../lib/clients";
import { NetworkSwitch } from "../components/NetworkSwitch";
import {
  fmt, loadOrders, orderBookAbi, TriggerState, type OrderView,
} from "../lib/orderbook";

type Tab = "markets" | "create" | "orders" | "proof";
const TABS: { id: Tab; label: string }[] = [
  { id: "markets", label: "Markets" },
  { id: "create", label: "Create order" },
  { id: "orders", label: "Orders" },
  { id: "proof", label: "Proof" },
];

function AppInner() {
  // Every read below is bound to the selected network. Nothing infers it, because reading a
  // mainnet pool through the testnet RPC returns nothing and that looks like an empty pool.
  const { network, info, client, setNetwork } = useNetwork();
  const market = defaultMarketFor(network);
  const book = info.orderBook;

  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [head, setHead] = useState<bigint | null>(null);
  const [caps, setCaps] = useState<{ order: string; total: string; filled: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [keeper, setKeeper] = useState<KeeperStatus | null>(null);

  useEffect(() => {
    let alive = true;
    // Clear first: showing the previous network's orders under a new network label is worse
    // than showing nothing.
    setOrders(null); setCaps(null); setKeeper(null); setHead(null); setErr(null);
    const load = async () => {
      try {
        const [h, os, maxOrder, maxTotal, filled] = await Promise.all([
          client.getBlockNumber(),
          loadOrders(book, client),
          client.readContract({ address: book, abi: orderBookAbi, functionName: "maxOrderValueUsdc" }),
          client.readContract({ address: book, abi: orderBookAbi, functionName: "maxTotalValueUsdc" }),
          client.readContract({ address: book, abi: orderBookAbi, functionName: "totalFilledUsdc" }),
        ]);
        if (!alive) return;
        setHead(h);
        readKeeper(book, client, logsClientFor(network)).then((k) => { if (alive) setKeeper(k); });
        setOrders(os);
        // Zero means unlimited in the contract; say so rather than printing "0.000000".
        const cap = (v: bigint) => (v === 0n ? "uncapped" : fmt(Number(v) / 1e6));
        setCaps({ order: cap(maxOrder as bigint), total: cap(maxTotal as bigint), filled: fmt(Number(filled as bigint) / 1e6) });
        setErr(null);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
      }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(t); };
    // Re-runs on network change: `book` and `client` both switch with it, and `network`
    // selects the log-capable RPC.
  }, [book, client, network]);

  const open = orders?.filter((o) => o.status === 1) ?? [];
  const closed = orders?.filter((o) => o.status !== 1) ?? [];

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      <Atmosphere relief={false} />

      <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", justifyContent: "center", padding: 16, pointerEvents: "none" }}>
        <div
          style={{
            pointerEvents: "auto", width: "100%", maxWidth: 1160, display: "flex", flexWrap: "wrap",
            alignItems: "center", justifyContent: "space-between", gap: 12,
            padding: "8px 8px 8px 16px", border: "1px solid var(--hair)", borderRadius: 28,
            background: "rgba(24,21,17,.55)", backdropFilter: "blur(20px) saturate(1.3)",
            WebkitBackdropFilter: "blur(20px) saturate(1.3)", boxShadow: "0 1px 2px rgba(0,0,0,.45)",
          }}
        >
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span style={{ width: 14, height: 14, borderRadius: 999, background: "var(--vermilion)" }} />
            <span className="serif" style={{ fontSize: 22, lineHeight: "28px", letterSpacing: "-0.011em", color: "var(--ink)" }}>Arc</span>
            <span className="label">Conditional Orders</span>
          </a>

          <nav style={{ display: "flex", gap: 2, overflowX: "auto" }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  appearance: "none", border: "none", padding: "8px 14px", borderRadius: 999,
                  font: "inherit", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
                  color: tab === t.id ? "var(--vermilion-2)" : "var(--ink-2)",
                  background: tab === t.id ? "rgba(255,107,61,.15)" : "transparent",
                }}
              >
                {t.label}
              </button>
            ))}
            <a
              href="/docs"
              style={{
                padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                whiteSpace: "nowrap", color: "var(--ink-2)", textDecoration: "none",
              }}
            >
              Docs
            </a>
            <a
              href="/status"
              style={{
                padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                whiteSpace: "nowrap", color: "var(--ink-2)", textDecoration: "none",
              }}
            >
              Status
            </a>
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div className="num" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: "var(--sunk)", fontSize: 12, color: err ? "var(--brick)" : "var(--ink-2)" }}>
              <span className={err ? "" : "pulse"} style={{ width: 7, height: 7, borderRadius: 999, background: err ? "var(--brick)" : "var(--pine)" }} />
              {err ? "rpc unreachable" : head ? head.toLocaleString() : "connecting…"}
            </div>
            <NetworkSwitch compact />
            <Connect />
          </div>
        </div>
      </header>

      <main style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "12px 24px 96px" }}>
        {tab === "markets" && <Markets network={network} onSetStop={() => setTab("create")} />}
        {tab === "create" && <Create currentTick={null} market={market} orderBook={book} />}
        {tab === "proof" && <Proof />}

        {tab === "orders" && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <h1 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: "46px", letterSpacing: "-0.02em", fontWeight: 400 }}>Orders</h1>
                <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: "19px", color: "var(--ink-2)", maxWidth: "68ch" }}>
                  Read live from the deployed OrderBook. Nothing here executes unless a keeper is
                  running and the fee covers the gas.
                </p>
              </div>
              <button
                onClick={() => setTab("create")}
                style={{ height: 40, padding: "0 20px", border: "none", borderRadius: 6, background: "var(--vermilion)", color: "var(--paper)", font: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                New order
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 520px", minWidth: 0 }}>
                {orders === null && !err && (
                  <p className="num" style={{ fontSize: 13, color: "var(--ink-3)" }}>reading the chain…</p>
                )}
                {err && (
                  <div style={{ padding: 20, border: "1px solid var(--brick)", borderRadius: 6, color: "var(--brick)", fontSize: 13 }}>
                    Could not read the OrderBook: <span className="num">{err}</span>
                  </div>
                )}
                {orders !== null && orders.length === 0 && (
                  <div style={{ padding: "36px 22px", borderTop: "1px solid var(--rule)", borderLeft: "2px solid var(--rule-2)" }}>
                    <h2 style={{ margin: 0, fontSize: 19, fontWeight: 500 }}>
                      {network === "mainnet" ? "No orders on mainnet yet" : "No orders yet"}
                    </h2>
                    {network === "mainnet" ? (
                      <>
                        {/* An empty book is the honest state, but a bare "nothing here" reads as
                            broken. Say what the deployment IS, and point at the thing to try. */}
                        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-2)", maxWidth: "62ch" }}>
                          The contract is live and configured — exposure is capped on-chain at{" "}
                          <span className="num">{caps?.order ?? "…"}</span> per fill and{" "}
                          <span className="num">{caps?.total ?? "…"}</span> cumulative. There is no
                          faucet here, so an order needs a token you already hold in one of the
                          listed pools.
                        </p>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                          <button
                            onClick={() => setNetwork("testnet")}
                            style={{ height: 34, padding: "0 16px", border: "1px solid var(--rule-3)", borderRadius: 6, background: "transparent", color: "var(--ink)", font: "inherit", fontSize: 13, cursor: "pointer" }}
                          >
                            Try it on testnet instead
                          </button>
                          <a href="/status" style={{ height: 34, display: "inline-flex", alignItems: "center", padding: "0 16px", borderRadius: 6, border: "1px solid var(--rule-3)", color: "var(--ink-2)", fontSize: 13, textDecoration: "none" }}>
                            See the live configuration
                          </a>
                        </div>
                      </>
                    ) : (
                      <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-2)", maxWidth: "58ch" }}>
                        This OrderBook has never held an order. Set one here — faucet funds, real
                        contracts, the same code path as mainnet.
                      </p>
                    )}
                  </div>
                )}

                {open.map((o) => <OrderCard key={o.id.toString()} o={o} dec={market.decimals} />)}

                {closed.length > 0 && (
                  <>
                    <div className="label" style={{ marginTop: 32, paddingBottom: 8 }}>Closed</div>
                    {closed.map((o) => <OrderCard key={o.id.toString()} o={o} dec={market.decimals} />)}
                  </>
                )}
              </div>

              <Rail
                keeper={keeper}
                head={head}
                liveOrders={orders === null ? null : orders.filter(
                  (o) => o.state !== TriggerState.NotOpen && o.state !== TriggerState.Expired
                ).length}
                caps={caps}
                orderBook={book}
                swapAdapter={info.swapAdapter}
                chainId={info.chainId}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <AppInner />
    </WalletProvider>
  );
}
