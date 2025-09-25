import { PublicKey } from "@solana/web3.js";

export function deriveVotePda(
  programId: PublicKey,
  proposal: PublicKey,
  voter: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote"), proposal.toBuffer(), voter.toBuffer()],
    programId
  )[0];
}
