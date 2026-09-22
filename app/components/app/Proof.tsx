import { Row } from "./Chip";
import { DEPLOY, FILL, GAS_ROWS, REFUSAL, TX, MAINNET_FILL, MAINNET_FILLS, MAINNET_TOTALS } from "../../lib/data";
import { addrUrl, short, txUrl } from "../../lib/chain";

const panel: React.CSSProperties = {
  flex: "1 1 320px", minWidth: 0, padding: 20,
  border: "1px solid rgba(242,237,226,.08)", borderRadius: 16, background: "var(--paper-2)",
};

const mono: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

/** Longest bar on the page, so every fill is read against the same scale rather than its own. */
const SCALE = Math.max(...MAINNET_FILLS.map((f) => Math.max(Number(f.fee), Number(f.gas))));

/**
 * Fee against gas, drawn to one shared scale. The whole claim of this project is that the top bar
 * is longer than the bottom one — and that the contract, not this page, is what enforces it.
 */
function MarginBars({ fee, gas }: { fee: string; gas: string }) {
  const bar = (v: string, color: string) => (
    <div style={{ height: 6, borderRadius: 3, background: "var(--rule)", overflow: "hidden" }}>
      <div style={{ width: `${(Number(v) / SCALE) * 100}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
  return (
    <div style={{ display: "grid", gap: 4, minWidth: 120 }}>
      {bar(fee, "var(--vermilion)")}
      {bar(gas, "var(--rule-3)")}
    </div>
  );
}

export function Proof() {
  return (
    <>
      <h1 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: "46px", letterSpacing: "-0.02em", fontWeight: 400 }}>
        Proof
      </h1>
      <p style={{ margin: "6px 0 28px", fontSize: 13, lineHeight: "19px", color: "var(--ink-2)", maxWidth: "72ch" }}>
        Three real fills on Arc mainnet, and two on testnet — one of which the invariant refused.
        The refusals are the useful part: a system that only ever succeeds tells you nothing about
        its safety property.
      </p>

      {/* ─────────────────────────── Mainnet ledger ─────────────────────────── */}

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 className="serif" style={{ margin: 0, fontSize: 26, fontWeight: 400, letterSpacing: "-0.01em" }}>
          Arc mainnet
        </h2>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          chain {DEPLOY.mainnetChainId} · real USDC · nobody pressed anything
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
        {[
          { label: "Fills", value: String(MAINNET_TOTALS.fills), sub: "all keeper-executed", tone: "var(--ink)" },
          { label: "Filled", value: MAINNET_TOTALS.filled, sub: `USDC, of a ${MAINNET_TOTALS.cap} on-chain cap`, tone: "var(--ink)" },
          { label: "Fee over gas", value: "1.24×–2.24×", sub: "every fill, enforced on-chain", tone: "var(--pine)" },
        ].map((s) => (
          <div key={s.label} style={{ ...panel, padding: "16px 20px", flex: "1 1 200px" }}>
            <div className="label">{s.label}</div>
            <div className="num" style={{ ...mono, fontSize: 26, lineHeight: "32px", color: s.tone }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ ...panel, width: "100%", marginBottom: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px 12px" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>The ledger</h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
            Every figure is read from the <span className="num">OrderFilled</span> event, not computed
            here. The upper bar is the fee the keeper collected; the lower one is the gas that fill
            actually burned.
          </p>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--ink-3)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {["Order", "Block", "Proceeds", "Fee", "Gas", "", "Margin", ""].map((h, i) => (
                  <th key={i} style={{ textAlign: i >= 2 && i <= 4 || i === 6 ? "right" : "left", fontWeight: 600, padding: "8px 12px", borderBottom: "1px solid var(--rule)", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MAINNET_FILLS.map((f) => (
                <tr key={f.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                  <td style={{ padding: "12px", color: "var(--ink-2)" }}>
                    #{f.id}
                    {"note" in f && (
                      <span style={{ display: "block", fontSize: 10, color: "var(--brick)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2 }}>
                        refused once
                      </span>
                    )}
                  </td>
                  <td className="num" style={{ ...mono, padding: "12px", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{f.block.toLocaleString()}</td>
                  <td className="num" style={{ ...mono, padding: "12px", textAlign: "right", color: "var(--ink)" }}>{f.out}</td>
                  <td className="num" style={{ ...mono, padding: "12px", textAlign: "right", color: "var(--vermilion)" }}>
                    {f.fee}
                    <span style={{ display: "block", fontSize: 10, color: "var(--ink-3)" }}>{f.feeBps / 100}%</span>
                  </td>
                  <td className="num" style={{ ...mono, padding: "12px", textAlign: "right", color: "var(--ink-2)" }}>−{f.gas}</td>
                  <td style={{ padding: "12px", width: 140 }}><MarginBars fee={f.fee} gas={f.gas} /></td>
                  <td className="num" style={{ ...mono, padding: "12px", textAlign: "right", color: "var(--pine)", fontSize: 15 }}>{f.marginX}</td>
                  <td style={{ padding: "12px" }}>
                    <a href={`https://explorer.arc.io/tx/${f.tx}`} target="_blank" rel="noreferrer" title={f.tx} className="num" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                      tx ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* The strongest single piece of evidence in the project: the same order, unchanged,
          refused and then allowed — because the real cost of running it moved. */}
      <div style={{ ...panel, width: "100%", marginBottom: 16, borderLeft: "2px solid var(--brick)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>
          Order #2 — refused, then filled
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: "19px", color: "var(--ink-2)", maxWidth: "70ch" }}>
          Nothing about the order changed between these two moments. Only the real cost of running
          it did. That is the difference between an invariant and a hard-coded minimum — and it is
          visible on-chain rather than asserted here.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: "1 1 260px", minWidth: 0, padding: 14, borderRadius: 12, background: "var(--sunk)", border: "1px solid var(--rule)" }}>
            <div className="label" style={{ color: "var(--brick)" }}>At 24.85 Gwei · refused</div>
            <Row label="Fee it would collect" value="0.008464" />
            <Row label="Gas it would burn" value="0.00889245" />
            <Row label="fee − gas" value="−0.00042845" tone="var(--brick)" />
            <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
              <span className="num">CostFloor</span> reverted, the keeper skipped it, and order #3
              filled normally in the meantime. No gas was spent on the attempt — it was caught in
              simulation.
            </p>
          </div>

          <div style={{ flex: "1 1 260px", minWidth: 0, padding: 14, borderRadius: 12, background: "var(--sunk)", border: "1px solid var(--rule)" }}>
            <div className="label" style={{ color: "var(--pine)" }}>18 blocks later · filled</div>
            <Row label="Fee collected" value="0.008581" />
            <Row label="Gas burned" value="0.00663479" />
            <Row label="Margin" value="1.29×" tone="var(--pine)" />
            <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
              Gas fell, the same order cleared, and the trader was paid{" "}
              <span className="num">1.716212</span> USDC.{" "}
              <a href="https://explorer.arc.io/tx/0x63691eb4c7d282a5f0241c0ff194f1696349a7a10d0ae613a87d7177e5ff7c94" target="_blank" rel="noreferrer" className="num">
                tx ↗
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* The dwell. Order #1 is the one with an arm transaction to point at. */}
      <div style={{ ...panel, width: "100%", marginBottom: 32, borderLeft: "2px solid var(--vermilion)" }}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600 }}>
          Order #1 — the dwell, in two blocks 18 apart
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, lineHeight: "19px", color: "var(--ink-2)", maxWidth: "70ch" }}>
          Selling {MAINNET_FILL.token} for USDC. The gap between arm and fill <em>is</em> the
          security property: a price spike reverted inside one transaction cannot satisfy two
          observations in two different blocks.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap", marginBottom: 16 }}>
          {[
            { block: MAINNET_FILL.armBlock, label: "armOrder", detail: "tick observed, armedAtBlock recorded", href: MAINNET_FILL.arm, color: "var(--vermilion)" },
            { block: MAINNET_FILL.fillBlock, label: "execute", detail: "tick re-derived, never trusted", href: MAINNET_FILL.fill, color: "var(--pine)" },
          ].map((s, i) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", flex: "1 1 240px", minWidth: 0 }}>
              {i === 1 && (
                <div style={{ flex: "0 0 auto", padding: "0 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>18 blocks</div>
                  <div style={{ height: 1, background: "var(--rule-3)", margin: "4px 0" }} />
                  <div style={{ fontSize: 10, color: "var(--ink-3)", whiteSpace: "nowrap" }}>≈ 9s</div>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0, padding: 14, borderRadius: 12, background: "var(--sunk)", borderLeft: `2px solid ${s.color}` }}>
                <div className="num" style={{ ...mono, fontSize: 11, color: "var(--ink-3)" }}>block {s.block.toLocaleString()}</div>
                <div className="num" style={{ fontSize: 14, color: "var(--ink)", margin: "2px 0" }}>{s.label}</div>
                <div style={{ fontSize: 11, lineHeight: "15px", color: "var(--ink-3)" }}>{s.detail}</div>
                <a href={`https://explorer.arc.io/tx/${s.href}`} target="_blank" rel="noreferrer" title={s.href} className="num" style={{ display: "inline-block", marginTop: 6, fontSize: 11 }}>
                  {short(s.href)} ↗
                </a>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <Row label="Proceeds" value={MAINNET_FILL.proceeds} />
            <Row label={`Keeper fee (${MAINNET_FILL.feeBps / 100}%)`} value={MAINNET_FILL.fee} />
            <Row label="Gas used" value={MAINNET_FILL.gasUsed} />
            <Row label="Gas cost" value={`−${MAINNET_FILL.gasCost}`} />
            <Row label="Margin over gas" value={MAINNET_FILL.marginX} tone="var(--pine)" />
          </div>
          <div style={{ flex: "1 1 240px", minWidth: 0 }}>
            <h4 style={{ margin: "0 0 8px", fontSize: 12, color: "var(--ink-3)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Mainnet contracts
            </h4>
            {[["OrderBook", DEPLOY.mainnetOrderBook], ["Swap adapter", DEPLOY.mainnetSwapAdapter], ["Keeper", DEPLOY.keeper]].map(([l, a]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid var(--rule)", fontSize: 13, color: "var(--ink-2)" }}>
                <span>{l}</span>
                <a href={`https://explorer.arc.io/address/${a}`} target="_blank" rel="noreferrer" title={a} className="num" style={{ fontSize: 13 }}>{short(a)} ↗</a>
              </div>
            ))}
            <p style={{ margin: "10px 0 0", fontSize: 11, lineHeight: "16px", color: "var(--ink-3)" }}>
              The {MAINNET_FILL.token} that funded order #1 was{" "}
              <a href={`https://explorer.arc.io/tx/${MAINNET_FILL.buy}`} target="_blank" rel="noreferrer" className="num">bought on-chain ↗</a>{" "}
              first, so the position being stopped out is a real one.
            </p>
          </div>
        </div>
      </div>

      {/* ─────────────────────────── Testnet ─────────────────────────── */}

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 className="serif" style={{ margin: 0, fontSize: 26, fontWeight: 400, letterSpacing: "-0.01em" }}>
          Arc testnet
        </h2>
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          chain {DEPLOY.chainId} · the sandbox this app lets you drive
        </span>
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
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>Testnet contracts</h3>
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
