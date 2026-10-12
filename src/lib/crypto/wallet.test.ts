import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatNative, parseWalletError, shortAddress } from "./wallet.ts";
import {
  DEFAULT_WALLET_LIMITS,
  buildSiweMessage,
  decodeErc20Call,
  evaluateAction,
  isUnlimitedApproval,
  makeContractCall,
  makeNativeSend,
  makeSignMessage,
  makeTokenTransfer,
  spentUsdToday,
  type WalletAction,
  type WalletLimits,
} from "./wallet-actions.ts";

function proposed(overrides: Partial<WalletAction>): WalletAction {
  return {
    ...makeNativeSend({
      from: "0x1111111111111111111111111111111111111111",
      to: "0x2222222222222222222222222222222222222222",
      amountEth: 0.01,
      usdEstimate: 10,
      chainId: 1,
    }),
    ...overrides,
  };
}

const limits: WalletLimits = { ...DEFAULT_WALLET_LIMITS };

describe("shortAddress", () => {
  it("trims long addresses and leaves short ones alone", () => {
    assert.equal(shortAddress("0x1234567890abcdef1234567890abcdef12345678"), "0x1234…5678");
    assert.equal(shortAddress("0xabc"), "0xabc");
  });
});

describe("parseWalletError", () => {
  it("recognizes user rejection", () => {
    assert.equal(parseWalletError({ code: 4001, message: "User rejected" }).code, "rejected");
    assert.equal(parseWalletError(new Error("User denied request")).code, "rejected");
  });

  it("recognizes unauthorized and falls back to failed", () => {
    assert.equal(parseWalletError({ code: 4100 }).code, "unauthorized");
    assert.equal(parseWalletError(new Error("boom")).code, "failed");
    assert.equal(parseWalletError(null).code, "failed");
  });
});

describe("formatNative", () => {
  it("formats wei as a readable decimal", () => {
    assert.equal(formatNative("0xde0b6b3a7640000"), "1"); // 1 ETH
    assert.equal(formatNative("1500000000000000000"), "1.5");
    assert.equal(formatNative("0x0"), "0");
  });
});

describe("decodeErc20Call", () => {
  const to = "2222222222222222222222222222222222222222";
  const amount = (10n ** 18n).toString(16).padStart(64, "0");

  it("decodes a transfer", () => {
    const decoded = decodeErc20Call(`0xa9059cbb${to.padStart(64, "0")}${amount}`);
    assert.equal(decoded?.name, "erc20-transfer");
    assert.equal(decoded?.to, `0x${to}`);
    assert.equal(decoded?.amount, 10n ** 18n);
  });

  it("decodes an approve", () => {
    const decoded = decodeErc20Call(`0x095ea7b3${to.padStart(64, "0")}${amount}`);
    assert.equal(decoded?.name, "erc20-approve");
  });

  it("returns null for unknown or malformed data", () => {
    assert.equal(decodeErc20Call("0x"), null);
    assert.equal(decodeErc20Call("deadbeef"), null);
    assert.equal(decodeErc20Call("0xabcdef1234"), null);
  });
});

describe("isUnlimitedApproval", () => {
  it("flags max-style amounts and treats unreadable as unlimited", () => {
    assert.equal(isUnlimitedApproval(2n ** 256n - 1n), true);
    assert.equal(isUnlimitedApproval(2n ** 96n), true);
    assert.equal(isUnlimitedApproval(2n ** 95n), false);
    assert.equal(isUnlimitedApproval(1000n), false);
    assert.equal(isUnlimitedApproval(null), true);
  });
});

describe("evaluateAction", () => {
  it("blocks a bad recipient address", () => {
    const result = evaluateAction(proposed({ to: "not-an-address" }), limits);
    assert.equal(result.level, "block");
    assert.ok(result.blocks.some((b) => /loses funds/i.test(b)));
  });

  it("blocks over the per-transaction cap", () => {
    const result = evaluateAction(proposed({ valueUsdEstimate: 500 }), limits);
    assert.equal(result.level, "block");
    assert.ok(result.blocks.some((b) => /per-transaction cap/i.test(b)));
  });

  it("blocks over the daily cap", () => {
    const result = evaluateAction(proposed({ valueUsdEstimate: 40 }), limits, 180);
    assert.equal(result.level, "block");
    assert.ok(result.blocks.some((b) => /daily cap/i.test(b)));
  });

  it("blocks unlimited approvals by default and warns when explicitly allowed", () => {
    const data = `0x095ea7b3${"2".repeat(63)}2${"f".repeat(64)}`;
    const action = proposed({ kind: "contract-call", data, valueUsdEstimate: 0 });
    const blocked = evaluateAction(action, limits);
    assert.equal(blocked.level, "block");
    assert.ok(blocked.blocks.some((b) => /UNLIMITED token approval/i.test(b)));

    const allowed = evaluateAction(action, { ...limits, allowUnlimitedApprovals: true });
    assert.equal(allowed.level, "warn");
  });

  it("warns on unrecognized calldata but does not block", () => {
    const action = proposed({
      kind: "contract-call",
      data: "0xabcdef1234567890",
      valueUsdEstimate: 5,
    });
    const result = evaluateAction(action, limits);
    assert.equal(result.level, "warn");
    assert.ok(result.warnings.some((w) => /blind/i.test(w)));
  });

  it("lets message signatures through without value checks", () => {
    const action = makeSignMessage({ message: "hello", chainId: 1, title: "Sign in" });
    const result = evaluateAction(action, limits);
    assert.equal(result.level, "ok");
    assert.deepEqual(result.blocks, []);
  });

  it("warns when no USD estimate is set on a value action", () => {
    const result = evaluateAction(proposed({ valueUsdEstimate: null }), limits);
    assert.ok(result.warnings.some((w) => /caps can't account/i.test(w)));
  });
});

describe("spentUsdToday", () => {
  it("counts submitted and failed actions from today only", () => {
    const today = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    const actions: WalletAction[] = [
      proposed({ valueUsdEstimate: 10, createdAt: today, status: "submitted" }),
      proposed({ valueUsdEstimate: 7, createdAt: today, status: "failed" }),
      proposed({ valueUsdEstimate: 5, createdAt: today, status: "proposed" }),
      proposed({ valueUsdEstimate: 99, createdAt: yesterday, status: "submitted" }),
    ];
    assert.equal(spentUsdToday(actions), 17);
  });
});

describe("buildSiweMessage", () => {
  it("emits the EIP-4361 shape", () => {
    const message = buildSiweMessage({
      domain: "app.example",
      address: "0xabc",
      uri: "https://app.example",
      chainId: 8453,
      nonce: "n0nce123456",
      issuedAt: "2026-10-12T12:00:00Z",
    });
    assert.match(message, /^app\.example wants you to sign in with your Ethereum account:/);
    assert.match(message, /\n0xabc\n/);
    assert.match(message, /URI: https:\/\/app\.example/);
    assert.match(message, /Chain ID: 8453/);
    assert.match(message, /Nonce: n0nce123456/);
    assert.match(message, /costs nothing/);
  });
});

describe("action factories", () => {
  it("converts native amounts to wei", () => {
    const action = makeNativeSend({
      from: "0x1",
      to: "0x2",
      amountEth: 1.5,
      usdEstimate: 10,
      chainId: 1,
    });
    assert.equal(action.valueWei, "1500000000000000000");
    assert.equal(action.kind, "send-native");
  });

  it("builds transfer calldata for token sends", () => {
    const action = makeTokenTransfer({
      tokenAddress: "0x3333333333333333333333333333333333333333",
      to: "0x2222222222222222222222222222222222222222",
      amount: 5,
      decimals: 18,
      symbol: "USDC",
      usdEstimate: 5,
      chainId: 1,
    });
    assert.ok(action.data.startsWith("0xa9059cbb"));
    assert.equal(action.to, "0x3333333333333333333333333333333333333333");
  });

  it("keeps contract calls and signatures distinct", () => {
    const call = makeContractCall({
      to: "0x2222222222222222222222222222222222222222",
      data: "0x1234",
      valueEth: 0,
      usdEstimate: 0,
      chainId: 1,
      title: "Claim",
    });
    assert.equal(call.kind, "contract-call");
    const sig = makeSignMessage({ message: "x", chainId: 1, title: "Sign in" });
    assert.equal(sig.kind, "sign-message");
    assert.equal(sig.valueWei, "0");
  });
});
