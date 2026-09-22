import { Row } from "./Chip";
import { DEPLOY, FILL, GAS_ROWS, REFUSAL, TX , MAINNET_FILL } from "../../lib/data";
import { addrUrl, short, txUrl } from "../../lib/chain";

const panel: React.CSSProperties = {
  flex: "1 1 320px", minWidth: 0, padding: 20,
  border: "1px solid rgba(242,237,226,.08)", borderRadius: 16, background: "var(--paper-2)",
};

export function Proof() {
  return (
    <>
      <h1 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: "46px", letterSpacing: "-0.02em", fontWeight: 400 }}>
        Proof
      </h1>
      <p style={{ margin: "6px 0 24px", fontSize: 13, lineHeight: "19px", color: "var(--ink-2)", maxWidth: "72ch" }}>
        A real fill on Arc mainnet, and two on testnet: one that filled, one the invariant
        refused. The refusal is the most useful of the three — a system that only ever succeeds
        tells you nothing about its safety property.
      </p>

      {/* Mainnet. Real USDC, and nobody pressed anything: the hosted keeper armed it and then
          filled it eighteen blocks later, on its own. */}
      <div style={{ ...panel, borderLeft: "2px solid var(--vermilion)", marginBottom: 16, width: "100%" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>
          Mainnet · filled autonomously by the keeper
        </h3>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--ink-3)" }}>
          Armed at block {MAINNET_FILL.armBlock.toLocaleString()}, filled at{" "}
          {MAINNET_FILL.fillBlock.toLocaleString()} — 18 blocks later, so the dwell held across
          blocks. Selling {MAINNET_FILL.token} for USDC.
        </p>
        <Row label="Proceeds" value={MAINNET_FILL.proceeds} />
        <Row label={`Keeper fee (${MAINNET_FILL.feeBps / 100}%)`} value={MAINNET_FILL.fee} />
        <Row label="Gas used" value={MAINNET_FILL.gasUsed} />
        <Row label="Gas cost" value={`−${MAINNET_FILL.gasCost}`} />
        <Row label="Margin over gas" value={MAINNET_FILL.marginX} tone="var(--pine)" />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
          <a href={`https://explorer.arc.io/tx/${MAINNET_FILL.fill}`} target="_blank" rel="noreferrer" className="num" style={{ fontSize: 13 }}>
            fill ↗
          </a>
          <a href={`https://explorer.arc.io/tx/${MAINNET_FILL.arm}`} target="_blank" rel="noreferrer" className="num" style={{ fontSize: 13 }}>
            arm ↗
          </a>
          <a href={`https://explorer.arc.io/tx/${MAINNET_FILL.buy}`} target="_blank" rel="noreferrer" className="num" style={{ fontSize: 13 }}>
            the buy that funded it ↗
          </a>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div style={{ ...panel, borderLeft: "2px solid var(--pine)" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>It filled</h3>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--ink-3)" }}>Block {FILL.block.toLocaleString()}</p>
          <Row label="Proceeds" value={FILL.proceeds} />
          <Row label="Keeper fee (0.50%)" value={FILL.fee} />
          <Row label="Gas used" value={FILL.gasUsed} />
          <Row label="Gas cost" value={`−${FILL.gasCost}`} />
          <Row label="Margin" value={`${FILL.margin}  (${FILL.marginX})`} tone="var(--pine)" />
          <a href={txUrl(TX.fill)} target="_blank" rel="noreferrer" title={TX.fill} className="num" style={{ display: "inline-block", marginTop: 12, fontSize: 13 }}>
            {short(TX.fill)} ↗
          </a>
        </div>

        <div style={{ ...panel, borderLeft: "2px solid var(--brick)" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>It refused</h3>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--ink-3)" }}>Caught in simulation; no gas spent</p>
          <Row label="Proceeds" value={REFUSAL.proceeds} />
          <Row label="Fee at 50 bps" value={REFUSAL.fee} />
          <Row label="Gas cost" value={REFUSAL.gasCost} />
          <Row label="Result" value={`${REFUSAL.result}  refused`} tone="var(--brick)" />
          <a href={txUrl(TX.armRefused)} target="_blank" rel="noreferrer" title={TX.armRefused} className="num" style={{ display: "inline-block", marginTop: 12, fontSize: 13 }}>
            {short(TX.armRefused)} ↗
          </a>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 16 }}>
        <div style={panel}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Measured gas</h3>
          {GAS_ROWS.map((g) => (
            <div key={g.call} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, padding: "8px 0", borderTop: "1px solid var(--rule)", fontSize: 13, color: "var(--ink-2)" }}>
              <span>{g.call}</span>
              <span className="num" style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "right" }}>{g.gas}</span>
              <span className="num" style={{ fontSize: 14, color: "var(--ink)", textAlign: "right", minWidth: 80 }}>{g.usdc}</span>
            </div>
          ))}
          <p style={{ margin: "12px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
            Measured on a mainnet fork and on testnet under arc-foundry, never estimated. Public
            figures for Arc execution costs disagree with one another; the method is in the repo.
          </p>
        </div>

        <div style={panel}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Contracts</h3>
          {[["OrderBook", DEPLOY.orderBook], ["Swap adapter", DEPLOY.swapAdapter], ["Keeper", DEPLOY.keeper]].map(([l, a]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--rule)", fontSize: 13, color: "var(--ink-2)" }}>
              <span>{l}</span>
              <a href={addrUrl(a)} target="_blank" rel="noreferrer" title={a} className="num" style={{ fontSize: 13 }}>{short(a)} ↗</a>
            </div>
          ))}
          <p style={{ margin: "12px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
            Arc testnet, chain {DEPLOY.chainId}. Every figure on this page links to the transaction
            or contract that produced it.
          </p>
        </div>
      </div>
    </>
  );
}
