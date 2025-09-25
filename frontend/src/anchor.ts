import * as anchor from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export function getAnchorProgram(
  idl: Idl,
  programIdStr: string,
  connection: anchor.web3.Connection,
  wallet: anchor.Wallet
) {
  // Optional logs to verify runtime
  // @ts-ignore
  console.log("Anchor JS VERSION:", (anchor as any).VERSION);
  const idlAny = idl as any;
  console.log(
    "IDL spec:",
    idlAny?.metadata?.spec,
    "IDL address:",
    idlAny?.address,
    "accounts:",
    idlAny?.accounts?.map?.((a: any) => a.name)
  );

  if (!idlAny || typeof idlAny !== "object") {
    throw new Error("IDL not loaded. Check import path and npm run sync-idl.");
  }

  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    anchor.AnchorProvider.defaultOptions()
  );
  anchor.setProvider(provider);

  const programId = new PublicKey(programIdStr);

  // Prevent the crash: remove account namespace so Program doesn't build it.
  const idlForProgram = { ...idlAny, accounts: [] as any[] };

  return new (anchor as any).Program(
    idlForProgram,
    programId,
    provider
  ) as anchor.Program;
}

/**
 * Read all accounts of a given type using discriminator + Borsh decode.
 * Keeps compatibility with the IDL spec 0.1.0.
 */
export async function fetchAllAccounts<T>(
  connection: anchor.web3.Connection,
  programId: PublicKey,
  idl: Idl,
  accountName: string
): Promise<{ pubkey: PublicKey; account: T }[]> {
  const coder = new anchor.BorshAccountsCoder(idl as any);
  const disc = coder.accountDiscriminator(accountName); // Buffer
  const accs = await connection.getProgramAccounts(programId, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(disc) } }],
  });
  return accs.map((a) => ({
    pubkey: a.pubkey,
    account: coder.decode(accountName, a.account.data) as T,
  }));
}
