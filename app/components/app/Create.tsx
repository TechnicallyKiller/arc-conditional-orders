"use client";

import { useMemo, useState } from "react";
import { encodeFunctionData, erc20Abi, parseAbi, type Hex } from "viem";
import { useWallet } from "../../lib/wallet";
import { DEPLOY } from "../../lib/data";
import { txUrl } from "../../lib/chain";
import { Row } from "./Chip";
import { TickScale } from "../TickScale";
import { TESTNET_MARKET } from "../../lib/markets";
import { fmt, humanPriceFromTick, sig, tickFromHumanPrice } from "../../lib/orderbook";
import { FILL } from "../../lib/data";

const field: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px", borderRadius: 2,
  border: "1px solid var(--rule-2)", background: "var(--sunk)", color: "var(--ink)",
  font: "inherit", fontFamily: "var(--font-mono), monospace", fontVariantNumeric: "tabular-nums",
};
const panel: React.CSSProperties = {
  padding: 18, border: "1px solid rgba(242,237,226,.08)", borderRadius: 16,
  background: "var(--paper-2)",
};

const createOrderAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "function createOrder(address tokenIn, uint128 amountIn, uint128 minAmountOut, PoolKey key, int24 triggerTick, bool triggerBelow, uint64 expiry) returns (uint256)",
]);

export function Create({ currentTick }: { currentTick: number | null }) {
  const m = TESTNET_MARKET;
  const w = useWallet();
  const [amount, setAmount] = useState("");
  const [trigger, setTrigger] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ hash: Hex } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const nowPrice = currentTick === null ? null : humanPriceFromTick(currentTick, 6, m.decimals);

  const calc = useMemo(() => {
    const t = parseFloat(trigger);
    const amt = parseFloat(amount);
    // Decimals-aware: a V4 tick prices raw units, a typed price is in display units.
    const tick = tickFromHumanPrice(t, 6, m.decimals);
    const back = tick === null ? NaN : humanPriceFromTick(tick, 6, m.decimals);
    const drift = tick === null ? 1 : Math.abs(back - t) / t;

    const gross = isFinite(amt) && isFinite(t) && t > 0 ? amt * t : 0;
    const poolFee = gross * (m.poolFeeBps / 10_000);
    const net = gross - poolFee;
    const keeperFee = net * 0.005;
    // The gas figure is the measured testnet fill, not an estimate.
    const gas = parseFloat(FILL.gasCost);
    const clears = keeperFee - gas;
    return { t, tick, back, drift, gross, poolFee, net, keeperFee, gas, clears };
  }, [amount, trigger, m.decimals, m.poolFeeBps]);

  const valid = calc.tick !== null;
  const amountWei = (() => {
    const a = parseFloat(amount);
    return isFinite(a) && a > 0 ? BigInt(Math.floor(a * 10 ** m.decimals)) : 0n;
  })();

  // The contract refuses minAmountOut == 0: without a floor, the only thing bounding a fill is
  // the keeper's own gas, which is a few cents regardless of how large the order is.
  const SLIPPAGE_BPS = 100; // 1%
  const expectedNet = calc.net - calc.keeperFee;
  const minAmountOut = expectedNet > 0
    ? BigInt(Math.floor(expectedNet * (1 - SLIPPAGE_BPS / 10_000) * 1e6))
    : 0n;
  // Orders are live against a standing allowance, so they should not outlive the intent.
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);

  const canSubmit =
    Boolean(w.address) && valid && amountWei > 0n && minAmountOut > 0n && calc.clears > 0 && !submitting;

  async function submit() {
    if (!canSubmit || calc.tick === null) return;
    setSubmitting(true); setSubmitError(null); setResult(null);
    try {
      // Approve exactly this order, not an unlimited allowance. One extra call, and the right
      // default for a contract that has not been audited.
      const approve = {
        to: m.token as Hex,
        data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [DEPLOY.orderBook as Hex, amountWei] }),
      };
      const create = {
        to: DEPLOY.orderBook as Hex,
        data: encodeFunctionData({
          abi: createOrderAbi, functionName: "createOrder",
          args: [
            m.token as Hex, amountWei, minAmountOut,
            { currency0: m.currency0, currency1: m.token, fee: m.fee, tickSpacing: m.tickSpacing, hooks: m.hooks },
            calc.tick, true, expiry,
          ],
        }),
      };
      const hash = await w.send([approve, create]);
      setResult({ hash });
      setAmount(""); setTrigger("");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setSubmitting(false);
    }
  }
  const backTone = !valid ? "var(--brick)" : calc.drift > 0.005 ? "var(--ochre)" : "var(--pine)";

  return (
    <>
      <h1 className="serif" style={{ margin: 0, fontSize: 44, lineHeight: "46px", letterSpacing: "-0.02em", fontWeight: 400 }}>
        Create order
      </h1>
      <p style={{ margin: "6px 0 24px", fontSize: 13, lineHeight: "19px", color: "var(--ink-2)", maxWidth: "72ch" }}>
        Sell <span style={{ color: "var(--ink)" }}>{m.symbol}</span> for USDC when price reaches
        your trigger. Everything below is checked before you sign.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <form style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }} onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="label" style={{ display: "block", marginBottom: 6 }}>Amount to sell ({m.symbol})</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.0" style={field} inputMode="decimal" />
          </div>
          <div>
            <label className="label" style={{ display: "block", marginBottom: 6 }}>Trigger price (USDC per {m.symbol})</label>
            <input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="0.00000000" style={field} inputMode="decimal" />
            {nowPrice !== null && (
              <div className="num" style={{ marginTop: 6, fontSize: 12, color: "var(--ink-3)" }}>
                price now {sig(nowPrice)}
              </div>
            )}
          </div>

          {/* The single highest-risk input in the app. */}
          <div style={{ padding: 16, borderRadius: 2, background: "var(--sunk)" }}>
            <div className="label" style={{ color: "var(--ink-2)" }}>Decimals check</div>
            <Row label="Computed tick" value={calc.tick === null ? "—" : calc.tick.toLocaleString()} />
            <Row label="Tick converts back to" value={valid ? sig(calc.back) : "—"} tone={backTone} />
            <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--ink-3)" }}>
              Read the second number. If it is not the price you meant, your decimals are wrong and
              no keeper will save you. Ticks are integers, so the nearest tick is rarely exactly the
              price you typed — a small difference is normal, a factor of a thousand is not.
            </p>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            style={{
              height: 48, borderRadius: 6, border: "none",
              background: canSubmit ? "var(--vermilion)" : "var(--rule-2)",
              color: canSubmit ? "var(--paper)" : "var(--ink-3)",
              font: "inherit", fontSize: 15, fontWeight: 600,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitting ? "Confirm in your wallet…"
              : !w.address ? "Connect a wallet to continue"
              : !valid || amountWei === 0n ? "Enter an amount and a trigger"
              : calc.clears <= 0 ? "Too small to be filled"
              : "Approve and create order"}
          </button>

          {result && (
            <div style={{ padding: 14, borderRadius: 2, background: "var(--sunk)", borderLeft: "2px solid var(--pine)" }}>
              <div className="label" style={{ color: "var(--pine)" }}>Order created</div>
              <a href={txUrl(result.hash)} target="_blank" rel="noreferrer" className="num" style={{ fontSize: 13 }}>
                {result.hash.slice(0, 10)}…{result.hash.slice(-6)} ↗
              </a>
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--ink-3)" }}>
                It will fill only when price reaches your trigger, a keeper is running, and the fee
                covers the gas. Watch it on the Orders tab.
              </p>
            </div>
          )}
          {submitError && (
            <div style={{ padding: 14, borderRadius: 2, background: "var(--sunk)", borderLeft: "2px solid var(--brick)", color: "var(--brick)", fontSize: 12 }}>
              {submitError}
            </div>
          )}
        </form>

        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={panel}>
            <div className="label" style={{ color: "var(--ink-2)", marginBottom: 12 }}>Preview</div>
            <TickScale
              triggerPct={valid && currentTick !== null ? 38 : 50}
              markerPct={currentTick !== null ? 62 : 50}
              triggerLabel={valid ? sig(calc.back) : "set a trigger"}
              leftLabel={calc.tick === null ? "tick —" : `tick ${calc.tick.toLocaleString()}`}
              rightLabel={currentTick === null ? "price —" : `now ${sig(humanPriceFromTick(currentTick, 6, m.decimals))}`}
            />
          </div>

          <div style={panel}>
            <div className="label" style={{ color: "var(--ink-2)" }}>If it filled at your trigger</div>
            <Row label="Gross proceeds" value={calc.gross ? fmt(calc.gross) : "—"} />
            <Row label={`Pool fee (${(m.poolFeeBps / 100).toFixed(2)}%)`} value={calc.gross ? `−${fmt(calc.poolFee)}` : "—"} />
            <Row label="You receive" value={calc.gross ? fmt(calc.net - calc.keeperFee) : "—"} />
            <Row label="Keeper fee (0.50%)" value={calc.gross ? fmt(calc.keeperFee) : "—"} />
            <Row
              label={`Minimum you accept (${SLIPPAGE_BPS / 100}% slippage)`}
              value={minAmountOut > 0n ? fmt(Number(minAmountOut) / 1e6) : "—"}
            />
            <Row label="Order expires" value="in 30 days" />
            <Row label="Gas cost (measured)" value={`−${fmt(calc.gas)}`} />
            <Row
              label="Cost floor"
              value={!calc.gross ? "—" : calc.clears > 0 ? `clears by ${fmt(calc.clears)}` : `short by ${fmt(Math.abs(calc.clears))}`}
              tone={!calc.gross ? undefined : calc.clears > 0 ? "var(--pine)" : "var(--brick)"}
            />
            {calc.gross > 0 && calc.clears <= 0 && (
              <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: "17px", color: "var(--brick)" }}>
                This order is too small. The keeper fee would not cover the gas, so no keeper will
                fill it and the contract would revert if one tried. Increase the size.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
