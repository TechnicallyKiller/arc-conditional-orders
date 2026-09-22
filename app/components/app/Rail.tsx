import { Chip } from "./Chip";
import { DEPLOY } from "../../lib/data";
import { addrUrl, short } from "../../lib/chain";
import { secondsFromBlocks, type KeeperStatus } from "../../lib/keeper";

const sect: React.CSSProperties = {
  padding: 18, border: "1px solid rgba(242,237,226,.08)", borderRadius: 16,
  background: "var(--paper-2)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
};
const h3: React.CSSProperties = { margin: 0, fontSize: 15, lineHeight: "21px", fontWeight: 600 };
const note: React.CSSProperties = { margin: "10px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" };
const kv: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, marginTop: 10, fontSize: 13, color: "var(--ink-2)" };

export function Rail({
  keeper, head, caps, orderBook, swapAdapter, chainId,
}: {
  keeper: KeeperStatus | null;
  head: bigint | null;
  caps: { order: string; total: string; filled: string } | null;
  orderBook: `0x${string}`;
  swapAdapter: `0x${string}`;
  chainId: number;
}) {
  const tone = !keeper ? "muted" : !keeper.reachable ? "refused" : keeper.alive ? "filled" : "unreadable";
  const word = !keeper ? "Checking" : !keeper.reachable ? "RPC down" : keeper.alive ? "Live" : "Not running";
  return (
    <aside style={{ flex: "1 1 280px", minWidth: 0, maxWidth: 360, display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={sect}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h3 style={h3}>Keeper</h3>
          <Chip tone={tone}>{word}</Chip>
        </div>
        <div style={kv}><span>Chain head</span><span className="num">{head ? head.toLocaleString() : "—"}</span></div>
        <div style={kv}>
          <span>Keeper last acted</span>
          <span className="num">{keeper?.lastSeen ? keeper.lastSeen.toLocaleString() : "never"}</span>
        </div>
        {keeper?.ageBlocks !== null && keeper?.ageBlocks !== undefined && (
          <div style={kv}>
            <span>Age</span>
            <span className="num" style={{ color: keeper.alive ? "var(--pine)" : "var(--ochre)" }}>
              {secondsFromBlocks(keeper.ageBlocks).toFixed(0)}s ago
            </span>
          </div>
        )}
        <p style={note}>
          Read from OrderArmed and OrderFilled events, not from order state — an order sits armed
          precisely because a keeper armed it and then stopped, so order state would report a dead
          keeper as live.
        </p>
        {keeper && !keeper.alive && keeper.reachable && (
          <p style={{ ...note, color: "var(--ochre)" }}>
            No keeper has acted recently. Orders will not arm or fill. Treat any protection here as
            suspended — anyone can run a keeper, and until someone does these orders are inert.
          </p>
        )}
      </section>

      <section style={sect}>
        <h3 style={{ ...h3, color: "var(--ochre)" }}>Unaudited</h3>
        <p style={note}>
          These contracts have not been audited. Testnet is a sandbox; on mainnet the value you can
          put at risk is capped on-chain.
        </p>
      </section>

      <section style={sect}>
        <h3 style={h3}>On-chain caps</h3>
        <div style={kv}><span>maxOrderValueUsdc</span><span className="num">{caps?.order ?? "…"}</span></div>
        <div style={kv}><span>maxTotalValueUsdc</span><span className="num">{caps?.total ?? "…"}</span></div>
        <div style={kv}><span>totalFilledUsdc</span><span className="num">{caps?.filled ?? "…"}</span></div>
        <p style={note}>Read live from OrderBook, not hardcoded here.</p>
      </section>

      <section style={sect}>
        <h3 style={h3}>Contracts</h3>
        {[["OrderBook", orderBook], ["Swap adapter", swapAdapter]].map(([l, a]) => (
          <div key={l} style={kv}>
            <span>{l}</span>
            <a href={addrUrl(a)} target="_blank" rel="noreferrer" title={a} className="num" style={{ fontSize: 13 }}>{short(a)} ↗</a>
          </div>
        ))}
        <div style={kv}><span>Chain</span><span className="num">{chainId}</span></div>
      </section>
    </aside>
  );
}
