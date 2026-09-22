"use client";

import { useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { useNetwork } from "../lib/network";
import { logsClientFor } from "../lib/clients";
import { orderBookAbi, TriggerState } from "../lib/orderbook";

/**
 * A stop-loss that silently does not fire is worse than none, so keeper health is shown, not
 * assumed. "Last seen" is the most recent block in which a keeper actually armed or filled —
 * derived from events, not from a status endpoint we control.
 *
 * But absence of evidence is not evidence of absence. With every order filled there is nothing
 * to arm, so a perfectly healthy keeper emits nothing and the naive check reports "no keeper"
 * — an amber alarm over an empty queue. Crying wolf here is not a cosmetic bug: it is the same
 * indicator that has to be believed on the day it means something.
 *
 * So the open-order count is read too, and it decides which of the two silences this is. It
 * comes from the contract (`checkOrders`), NOT from the keeper's own health report, because a
 * dead keeper will happily tell you it is fine.
 */
const ARMED = parseAbiItem("event OrderArmed(uint256 indexed id, int24 tick, uint64 atBlock)");
const FILLED = parseAbiItem(
  "event OrderFilled(uint256 indexed id, address indexed keeper, uint256 amountOut, uint256 fee, uint256 gasCostNative)"
);

/** ~34 minutes at Arc's 0.507s blocks. A keeper polling every few seconds clears this easily. */
const LOOKBACK = 4000n;

/** An order a keeper could still act on. Expired and NotOpen are nobody's work. */
const isLive = (s: TriggerState) => s !== TriggerState.NotOpen && s !== TriggerState.Expired;

export function KeeperStatus() {
  const { network, info, client } = useNetwork();
  const logs = logsClientFor(network);
  const [head, setHead] = useState<bigint | null>(null);
  const [lastSeen, setLastSeen] = useState<bigint | null>(null);
  const [liveOrders, setLiveOrders] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const h = await client.getBlockNumber();
        if (!alive) return;
        setHead(h);
        setFailed(false);

        const fromBlock = h > LOOKBACK ? h - LOOKBACK : 0n;
        const [armed, filled, next] = await Promise.all([
          logs.getLogs({ address: info.orderBook, event: ARMED, fromBlock, toBlock: h }),
          logs.getLogs({ address: info.orderBook, event: FILLED, fromBlock, toBlock: h }),
          client.readContract({ address: info.orderBook, abi: orderBookAbi, functionName: "nextOrderId" }),
        ]);
        if (!alive) return;

        // A fill proves liveness just as well as an arm, and after the last order fills it is
        // the only evidence left.
        const blocks = [...armed, ...filled].map((l) => l.blockNumber);
        setLastSeen(blocks.length ? blocks.reduce((a, b) => (b > a ? b : a)) : null);

        const ids = Array.from({ length: Number(next) - 1 }, (_, i) => BigInt(i + 1));
        if (!ids.length) { setLiveOrders(0); return; }
        const [states] = (await client.readContract({
          address: info.orderBook, abi: orderBookAbi, functionName: "checkOrders", args: [ids],
        })) as unknown as [number[], number[]];
        if (!alive) return;
        setLiveOrders(states.filter((s) => isLive(s as TriggerState)).length);
      } catch {
        if (alive) setFailed(true);
      }
    };
    setHead(null); setLastSeen(null); setLiveOrders(null);
    tick();
    const t = setInterval(tick, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [client, logs, info.orderBook]);

  // Silence with work outstanding is an alarm. Silence with an empty queue is just quiet.
  const idle = lastSeen === null && liveOrders === 0;
  const missing = lastSeen === null && liveOrders !== null && liveOrders > 0;

  const tone = failed ? "var(--brick)" : missing ? "var(--ochre)" : idle ? "var(--ink-3)" : "var(--pine)";
  const text = failed
    ? "rpc unreachable"
    : head === null || liveOrders === null
      ? "connecting…"
      : missing
        ? `no keeper · block ${head.toLocaleString()}`
        : idle
          ? `keeper idle · no open orders`
          : `keeper · ${lastSeen!.toLocaleString()}`;

  const title = failed
    ? undefined
    : missing
      ? `${liveOrders} open order(s) and no keeper has armed or filled in ${LOOKBACK} blocks. Orders will not fill.`
      : idle
        ? "Every order is filled or cancelled, so there is nothing for a keeper to arm. This is not a fault."
        : undefined;

  return (
    <div
      title={title}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
        borderRadius: 999, background: "var(--sunk)",
      }}
    >
      <span className={failed || idle ? "" : "pulse"} style={{ width: 7, height: 7, borderRadius: 999, background: tone }} />
      <span className="num" style={{ fontSize: 12, lineHeight: "17px", color: tone }}>{text}</span>
    </div>
  );
}
