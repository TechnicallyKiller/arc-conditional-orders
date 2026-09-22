"use client";

import { useEffect, useState } from "react";
import { parseAbi, parseAbiItem, formatUnits } from "viem";
import { useNetwork } from "../lib/network";
import { logsClientFor } from "../lib/clients";
import { SiteNav } from "../components/SiteNav";

const bookAbi = parseAbi([
  "function owner() view returns (address)",
  "function feeRecipient() view returns (address)",
  "function feeBps() view returns (uint16)",
  "function MAX_FEE_BPS() view returns (uint16)",
  "function minDwellBlocks() view returns (uint64)",
  "function maxArmAgeBlocks() view returns (uint64)",
  "function maxOrderValueUsdc() view returns (uint256)",
  "function maxTotalValueUsdc() view returns (uint256)",
  "function totalFilledUsdc() view returns (uint256)",
  "function nextOrderId() view returns (uint256)",
  "function routerAllowed(address) view returns (bool)",
]);

const ARMED = parseAbiItem("event OrderArmed(uint256 indexed id, int24 tick, uint64 atBlock)");
const FILLED = parseAbiItem(
  "event OrderFilled(uint256 indexed id, address indexed keeper, uint256 amountOut, uint256 fee, uint256 gasCostNative)"
);

/** ~100s at Arc's 0.507s blocks. A keeper polling every few seconds clears this easily. */
const STALE_AFTER_BLOCKS = 200n;
const HEALTH_URL = process.env.NEXT_PUBLIC_KEEPER_HEALTH_URL;

type Chain = {
  head: bigint;
  lastSeen: bigint | null;
  fills: number;
  cfg: Record<string, bigint | string | boolean>;
};

type Health = { healthy: boolean; ageMs: number | null; lastBlock: string | null; openOrders: number; fills: number; arms: number; mode: string; lastError: string | null };

const usdc = (v: bigint) => (v === 0n ? "unlimited" : `${formatUnits(v, 6)} USDC`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function StatusPage() {
  const { network, info, client } = useNetwork();
  // Logs go to the public RPC: provider free tiers cap eth_getLogs range (Alchemy: 10 blocks).
  const logs = logsClientFor(network);
  const [chain, setChain] = useState<Chain | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setChain(null);
    setErr(null);

    const read = async () => {
      try {
        const head = await client.getBlockNumber();
        const c = { address: info.orderBook, abi: bookAbi } as const;
        const [
          owner, feeRecipient, feeBps, maxFeeBps, minDwell, maxArmAge,
          maxOrder, maxTotal, totalFilled, nextId, routerOk,
        ] = await Promise.all([
          client.readContract({ ...c, functionName: "owner" }),
          client.readContract({ ...c, functionName: "feeRecipient" }),
          client.readContract({ ...c, functionName: "feeBps" }),
          client.readContract({ ...c, functionName: "MAX_FEE_BPS" }),
          client.readContract({ ...c, functionName: "minDwellBlocks" }),
          client.readContract({ ...c, functionName: "maxArmAgeBlocks" }),
          client.readContract({ ...c, functionName: "maxOrderValueUsdc" }),
          client.readContract({ ...c, functionName: "maxTotalValueUsdc" }),
          client.readContract({ ...c, functionName: "totalFilledUsdc" }),
          client.readContract({ ...c, functionName: "nextOrderId" }),
          client.readContract({ ...c, functionName: "routerAllowed", args: [info.swapAdapter] }),
        ]);

        const from = head > 3000n ? head - 3000n : 0n;
        const [armed, filled] = await Promise.all([
          logs.getLogs({ address: info.orderBook, event: ARMED, fromBlock: from, toBlock: head }),
          logs.getLogs({ address: info.orderBook, event: FILLED, fromBlock: from, toBlock: head }),
        ]);
        const blocks = [...armed, ...filled].map((l) => l.blockNumber);
        if (!live) return;
        setChain({
          head,
          lastSeen: blocks.length ? blocks.reduce((a, b) => (b > a ? b : a)) : null,
          fills: filled.length,
          cfg: {
            owner: owner as string,
            feeRecipient: feeRecipient as string,
            feeBps: BigInt(feeBps as number),
            maxFeeBps: BigInt(maxFeeBps as number),
            minDwell: minDwell as bigint,
            maxArmAge: maxArmAge as bigint,
            maxOrder: maxOrder as bigint,
            maxTotal: maxTotal as bigint,
            totalFilled: totalFilled as bigint,
            orders: (nextId as bigint) - 1n,
            routerOk: routerOk as boolean,
          },
        });
        setErr(null);
      } catch (e) {
        // A failed read must never render as a healthy zero — that is the bug this whole
        // project keeps re-learning. Say the read failed.
        if (live) setErr(e instanceof Error ? e.message.split("\n")[0] : String(e));
      }
    };

    read();
    const t = setInterval(read, 12_000);
    return () => { live = false; clearInterval(t); };
  }, [client, logs, info.orderBook, info.swapAdapter]);

  useEffect(() => {
    if (!HEALTH_URL) return;
    let live = true;
    const ping = async () => {
      try {
        const r = await fetch(HEALTH_URL, { cache: "no-store" });
        const j = (await r.json()) as Health;
        if (live) { setHealth(j); setHealthErr(null); }
      } catch (e) {
        if (live) { setHealth(null); setHealthErr(e instanceof Error ? e.message : String(e)); }
      }
    };
    ping();
    const t = setInterval(ping, 15_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const age = chain?.lastSeen == null ? null : chain.head - chain.lastSeen;
  const alive = age !== null && age < STALE_AFTER_BLOCKS;
  const tone = err ? "var(--brick)" : alive ? "var(--pine)" : "var(--ochre)";

  return (
    <>
      <SiteNav current="status" />
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "48px 20px 96px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="serif" style={{ fontSize: 38, margin: 0, color: "var(--ink)", letterSpacing: "-0.02em" }}>Status</h1>
          <p style={{ color: "var(--ink-2)", margin: "6px 0 0", fontSize: 14 }}>
            Read live from the chain on every load. Nothing here is cached or asserted.
          </p>
        </div>
      </div>

      {/* Keeper liveness, derived from events the keeper actually emitted. */}
      <section style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className={err ? "" : "pulse"} style={{ width: 9, height: 9, borderRadius: 999, background: tone }} />
          <h2 className="serif" style={{ fontSize: 22, margin: 0, color: "var(--ink)" }}>
            {err ? "Chain unreachable" : alive ? "Keeper is alive" : "No recent keeper activity"}
          </h2>
        </div>
        <p style={{ color: "var(--ink-2)", fontSize: 14, margin: "10px 0 0", lineHeight: 1.6 }}>
          Liveness is derived from <code style={code}>OrderArmed</code> and{" "}
          <code style={code}>OrderFilled</code> events, not from order state. An order sits in{" "}
          <em>Ready</em> precisely because a keeper armed it and then stopped — so &ldquo;something is
          armed&rdquo; would report a dead keeper as live.
        </p>
        {err ? (
          <p style={{ color: "var(--brick)", fontSize: 13, marginTop: 12 }}>{err}</p>
        ) : (
          <dl style={grid}>
            <Row k="Head block" v={chain ? chain.head.toLocaleString() : "…"} />
            <Row k="Last keeper action" v={chain?.lastSeen ? `block ${chain.lastSeen.toLocaleString()}` : "none in last 3,000 blocks"} />
            <Row k="Age" v={age === null ? "—" : `${age.toString()} blocks · ~${(Number(age) * 0.507).toFixed(0)}s`} />
            <Row k="Fills seen" v={chain ? String(chain.fills) : "…"} />
          </dl>
        )}
      </section>

      {/* Optional: the keeper process reporting on itself. */}
      {HEALTH_URL && (
        <section style={card}>
          <h2 className="serif" style={{ fontSize: 20, margin: 0, color: "var(--ink)" }}>Keeper process</h2>
          <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "6px 0 0" }}>
            Self-reported by the keeper host. The chain-derived signal above is the authoritative
            one — this can only tell you the process is running, not that it is working.
          </p>
          {healthErr ? (
            <p style={{ color: "var(--brick)", fontSize: 13, marginTop: 12 }}>unreachable · {healthErr}</p>
          ) : (
            <dl style={grid}>
              <Row k="Reported" v={health ? (health.healthy ? "healthy" : "STALE") : "…"} tone={health ? (health.healthy ? "var(--pine)" : "var(--brick)") : undefined} />
              <Row k="Mode" v={health?.mode ?? "…"} />
              <Row k="Last tick" v={health?.ageMs == null ? "—" : `${(health.ageMs / 1000).toFixed(0)}s ago`} />
              <Row k="Open orders" v={health ? String(health.openOrders) : "…"} />
              <Row k="Arms / fills" v={health ? `${health.arms} / ${health.fills}` : "…"} />
              {health?.lastError && <Row k="Last error" v={health.lastError} tone="var(--brick)" />}
            </dl>
          )}
        </section>
      )}

      {/* Everything below is read off the deployed bytecode, not from a config file. */}
      <section style={card}>
        <h2 className="serif" style={{ fontSize: 20, margin: 0, color: "var(--ink)" }}>Deployment</h2>
        <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "6px 0 14px" }}>{info.note}</p>
        <dl style={grid}>
          <Row k="Network" v={`${info.label} · chain ${info.chainId}`} />
          <Row k="OrderBook" v={<a href={`${info.explorer}/address/${info.orderBook}`} target="_blank" rel="noreferrer" style={link}>{short(info.orderBook)}</a>} />
          <Row k="Swap adapter" v={<a href={`${info.explorer}/address/${info.swapAdapter}`} target="_blank" rel="noreferrer" style={link}>{short(info.swapAdapter)}</a>} />
          {chain && (
            <>
              <Row k="Adapter allowlisted" v={chain.cfg.routerOk ? "yes" : "NO — fills will revert"} tone={chain.cfg.routerOk ? undefined : "var(--brick)"} />
              <Row k="Owner" v={short(chain.cfg.owner as string)} />
              <Row k="Fee recipient" v={short(chain.cfg.feeRecipient as string)} />
              <Row k="Fee" v={`${Number(chain.cfg.feeBps)} bps (ceiling ${Number(chain.cfg.maxFeeBps)})`} />
              <Row k="Dwell / arm age" v={`${chain.cfg.minDwell} / ${chain.cfg.maxArmAge} blocks`} />
              <Row k="Cap per fill" v={usdc(chain.cfg.maxOrder as bigint)} />
              <Row k="Cap cumulative" v={`${usdc(chain.cfg.maxTotal as bigint)} · ${formatUnits(chain.cfg.totalFilled as bigint, 6)} used`} />
              <Row k="Orders created" v={String(chain.cfg.orders)} />
            </>
          )}
        </dl>
      </section>

      <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 28 }}>
        <a href="/docs" style={link}>How it works</a> · <a href="/app" style={link}>Open the app</a>
      </p>
    </main>
    </>
  );
}

const card: React.CSSProperties = {
  marginTop: 24, padding: 22, borderRadius: 18,
  border: "1px solid var(--rule)", background: "var(--paper)",
};
const grid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "minmax(140px, auto) 1fr",
  gap: "10px 20px", margin: "16px 0 0",
};
const code: React.CSSProperties = { background: "var(--sunk)", padding: "1px 5px", borderRadius: 4, fontSize: 12 };
const link: React.CSSProperties = { color: "var(--vermilion-2)", textDecoration: "none" };

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) {
  return (
    <>
      <dt style={{ color: "var(--ink-3)", fontSize: 13 }}>{k}</dt>
      <dd className="num" style={{ margin: 0, color: tone ?? "var(--ink)", fontSize: 13, wordBreak: "break-word" }}>{v}</dd>
    </>
  );
}
