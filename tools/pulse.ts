/**
 * Demo market maker for the testnet sandbox.
 *
 * Arc testnet has no organic trading — 14 pools with liquidity and zero swaps in 40,000 blocks —
 * so a visitor sees a flat line and assumes the app is broken. This makes small real trades
 * against our own pool so the chart moves and orders actually trigger while someone watches.
 *
 * It is a demo aid and the UI says so. It trades the sandbox token, which is worth nothing.
 *
 *   pnpm tsx tools/pulse.ts
 */
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

// Deliberately NOT RPC_URL / SWAP_ADAPTER: those carry the MAINNET deployment once .env is set
// up for a mainnet deploy, and this script would then trade against a chain where the sandbox
// token does not exist. It failed exactly that way once. Testnet-specific names, testnet-only.
const RPC = process.env.TESTNET_RPC_URL ?? "https://rpc.testnet.arc.io";
const ADAPTER = (process.env.TESTNET_SWAP_ADAPTER ?? "0x2958d7445C5D0Aa9D06EAc625C85072E81CA49a3") as Hex;
const TESTNET_CHAIN_ID = 5042002;
const TOKEN = (process.env.DEMO_TOKEN ?? "0xB828890c52F6d0436D9f601E78adB9E056e61ba8") as Hex;
const USDC = "0x3600000000000000000000000000000000000000" as Hex;
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Hex;
const KEY = { currency0: "0x0000000000000000000000000000000000000000" as Hex, currency1: TOKEN, fee: 3000, tickSpacing: 60, hooks: "0x0000000000000000000000000000000000000000" as Hex };

/** Arc discards anything under 20 Gwei silently — no receipt, no error. */
const MIN_FEE = 20_000_000_000n;
const CENTER_TICK = 69081;   // where the pool was seeded
const BAND = 900;            // keep price within roughly +/-9% so triggers stay reachable
const PERIOD_MS = 9_000;

const adapterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "function swapExactIn(PoolKey key, bool zeroForOne, uint256 amountIn, address recipient) returns (uint256)",
]);
const erc20 = parseAbi(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);

const pk = process.env.KEEPER_PRIVATE_KEY as Hex;
if (!pk) { console.error("KEEPER_PRIVATE_KEY not set"); process.exit(1); }
const account = privateKeyToAccount(pk);
const pub = createPublicClient({ chain: arcTestnet, transport: http(RPC) });
const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(RPC) });

async function currentTick(): Promise<number> {
  const { keccak256, encodeAbiParameters } = await import("viem");
  const id = keccak256(encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint24" }, { type: "int24" }, { type: "address" }],
    [KEY.currency0, KEY.currency1, KEY.fee, KEY.tickSpacing, KEY.hooks]
  ));
  const slot = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [id, 6n]));
  const raw = await pub.readContract({
    address: PM,
    abi: [{ name: "extsload", type: "function", stateMutability: "view", inputs: [{ type: "bytes32" }], outputs: [{ type: "bytes32" }] }],
    functionName: "extsload", args: [slot],
  });
  let t = Number((BigInt(raw as Hex) >> 160n) & ((1n << 24n) - 1n));
  if (t >= 1 << 23) t -= 1 << 24;
  return t;
}

async function swap(zeroForOne: boolean, amountIn: bigint) {
  const data = encodeFunctionData({ abi: adapterAbi, functionName: "swapExactIn", args: [KEY, zeroForOne, amountIn, account.address] });
  const hash = await wallet.sendTransaction({ to: ADAPTER, data, maxFeePerGas: MIN_FEE, maxPriorityFeePerGas: 0n, chain: arcTestnet });
  await pub.waitForTransactionReceipt({ hash, confirmations: 1 });
  return hash;
}

async function main() {
  const id = await pub.getChainId();
  if (id !== TESTNET_CHAIN_ID) {
    console.error(`refusing to run: connected to chain ${id}, expected Arc testnet ${TESTNET_CHAIN_ID}.`);
    console.error("this script makes real trades; set TESTNET_RPC_URL rather than RPC_URL.");
    process.exit(1);
  }
  console.log("demo pulse — small real trades so the sandbox market is not flat");
  console.log(`  pool  ADEMO/USDC  adapter ${ADAPTER}`);
  for (const [token, spender] of [[USDC, ADAPTER], [TOKEN, ADAPTER]] as const) {
    const h = await wallet.sendTransaction({
      to: token, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [spender, 2n ** 255n] }),
      maxFeePerGas: MIN_FEE, maxPriorityFeePerGas: 0n, chain: arcTestnet,
    });
    await pub.waitForTransactionReceipt({ hash: h, confirmations: 1 });
  }
  console.log("  approvals set\n");

  for (;;) {
    try {
      const tick = await currentTick();
      const drift = tick - CENTER_TICK;
      // Mean-revert: past the band, always push back. Inside it, wander.
      const buy = drift > BAND ? true : drift < -BAND ? false : Math.random() > 0.5;
      // Vary the size so the line has texture rather than a sawtooth.
      const usdcIn = BigInt(Math.floor((0.01 + Math.random() * 0.04) * 1e18));
      const tokenBal = await pub.readContract({ address: TOKEN, abi: erc20, functionName: "balanceOf", args: [account.address] });
      const amount = buy ? usdcIn : (tokenBal as bigint) / 400n;
      if (amount === 0n) { await new Promise((r) => setTimeout(r, PERIOD_MS)); continue; }

      const hash = await swap(buy, amount);
      const after = await currentTick();
      console.log(`${new Date().toISOString().slice(11, 19)}  ${buy ? "BUY " : "SELL"}  tick ${tick} -> ${after}  ${hash.slice(0, 12)}…`);
    } catch (e) {
      console.error("  pulse tick failed:", e instanceof Error ? e.message.split("\n")[0] : e);
    }
    await new Promise((r) => setTimeout(r, PERIOD_MS));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
