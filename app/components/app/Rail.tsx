import { Chip } from "./Chip";
import { DEPLOY } from "../../lib/data";
import { addrUrl, short } from "../../lib/chain";

const sect: React.CSSProperties = {
  padding: 18, border: "1px solid rgba(242,237,226,.08)", borderRadius: 16,
  background: "rgba(31,28,22,.5)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
};
const h3: React.CSSProperties = { margin: 0, fontSize: 15, lineHeight: "21px", fontWeight: 600 };
const note: React.CSSProperties = { margin: "10px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" };
const kv: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, marginTop: 10, fontSize: 13, color: "var(--ink-2)" };

export function Rail({
  keeperAlive, head, caps,
}: {
  keeperAlive: boolean | null;
  head: bigint | null;
  caps: { order: string; total: string; filled: string } | null;
}) {
  return (
    <aside style={{ flex: "1 1 280px", minWidth: 0, maxWidth: 360, display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={sect}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h3 style={h3}>Keeper</h3>
          <Chip tone={keeperAlive === null ? "muted" : keeperAlive ? "filled" : "unreadable"}>
            {keeperAlive === null ? "Unknown" : keeperAlive ? "Live" : "Not running"}
          </Chip>
        </div>
        <div style={kv}><span>Chain head</span><span className="num">{head ? head.toLocaleString() : "—"}</span></div>
        <p style={note}>
          Fills depend on a keeper running. The contract is permissionless — anyone may run one,
          and nobody can steal with one — but if none does, orders sit and do not fire.
        </p>
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
        {[["OrderBook", DEPLOY.orderBook], ["Swap adapter", DEPLOY.swapAdapter]].map(([l, a]) => (
          <div key={l} style={kv}>
            <span>{l}</span>
            <a href={addrUrl(a)} target="_blank" rel="noreferrer" title={a} className="num" style={{ fontSize: 13 }}>{short(a)} ↗</a>
          </div>
        ))}
        <div style={kv}><span>Chain</span><span className="num">{DEPLOY.chainId}</span></div>
      </section>
    </aside>
  );
}
