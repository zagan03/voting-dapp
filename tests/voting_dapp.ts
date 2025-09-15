import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { VotingDapp } from "../target/types/voting_dapp";
import { assert } from "chai";

describe("voting_dapp", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.VotingDapp as Program<VotingDapp>;

  it("Can create a proposal", async () => {
    const proposal = anchor.web3.Keypair.generate();

    await program.methods
      .createProposal("Should we build a new feature?")
      .accounts({
        proposal: proposal.publicKey,
        creator: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([proposal])
      .rpc();

    const proposalAccount = await program.account.proposal.fetch(
      proposal.publicKey
    );

    assert.equal(
      proposalAccount.description,
      "Should we build a new feature?"
    );
    assert.equal(proposalAccount.votesYes.toNumber(), 0);
    assert.equal(proposalAccount.votesNo.toNumber(), 0);
    assert.equal(proposalAccount.isActive, true);
  });

  it("Can vote yes on a proposal", async () => {
    const proposal = anchor.web3.Keypair.generate();
    const vote = anchor.web3.Keypair.generate();

    // First create the proposal
    await program.methods
      .createProposal("Fund project X?")
      .accounts({
        proposal: proposal.publicKey,
        creator: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([proposal])
      .rpc();

    // Then cast a YES vote
    await program.methods
      .vote(true)
      .accounts({
        proposal: proposal.publicKey,
        vote: vote.publicKey,
        voter: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([vote])
      .rpc();

    const proposalAccount = await program.account.proposal.fetch(
      proposal.publicKey
    );

    assert.equal(proposalAccount.votesYes.toNumber(), 1);
    assert.equal(proposalAccount.votesNo.toNumber(), 0);
  });

  it("Can close a proposal", async () => {
    const proposal = anchor.web3.Keypair.generate();

    // Create proposal
    await program.methods
      .createProposal("Close test proposal")
      .accounts({
        proposal: proposal.publicKey,
        creator: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([proposal])
      .rpc();

    // Close it
    await program.methods
      .closeProposal()
      .accounts({
        proposal: proposal.publicKey,
        creator: provider.wallet.publicKey,
      })
      .rpc();

    const proposalAccount = await program.account.proposal.fetch(
      proposal.publicKey
    );

    assert.equal(proposalAccount.isActive, false);
  });
});
