"use client";

import { useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { useNetwork } from "../lib/network";

/**
 * A stop-loss that silently does not fire is worse than none, so keeper health is shown, not
 * assumed. "Last seen" is the most recent block in which a keeper actually armed or filled —
 * derived from events, not from a status endpoint we control.
 */
export function KeeperStatus() {
  const { info, client } = useNetwork();
  const [head, setHead] = useState<bigint | null>(null);
  const [lastSeen, setLastSeen] = useState<bigint | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const h = await client.getBlockNumber();
        if (!alive) return;
        setHead(h);
        setFailed(false);
        const logs = await client.getLogs({
          address: info.orderBook,
          event: parseAbiItem("event OrderArmed(uint256 indexed id, int24 tick, uint64 atBlock)"),
          fromBlock: h - 4000n > 0n ? h - 4000n : 0n,
          toBlock: h,
        });
        if (!alive) return;
        setLastSeen(logs.length ? logs[logs.length - 1].blockNumber : null);
      } catch {
        if (alive) setFailed(true);
      }
    };
    setHead(null); setLastSeen(null);
    tick();
    const t = setInterval(tick, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [client, info.orderBook]);

  const stale = lastSeen === null;
  const tone = failed ? "var(--brick)" : stale ? "var(--ochre)" : "var(--pine)";
  const text = failed
    ? "rpc unreachable"
    : head === null
      ? "connecting…"
      : stale
        ? `no keeper · block ${head.toLocaleString()}`
        : `keeper · ${lastSeen.toLocaleString()}`;

  return (
    <div
      title={stale && !failed ? "No keeper has armed an order recently. Orders will not fill." : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
        borderRadius: 999, background: "var(--sunk)",
      }}
    >
      <span className={failed ? "" : "pulse"} style={{ width: 7, height: 7, borderRadius: 999, background: tone }} />
      <span className="num" style={{ fontSize: 12, lineHeight: "17px", color: tone }}>{text}</span>
    </div>
  );
}
