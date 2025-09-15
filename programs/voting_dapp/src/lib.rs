use anchor_lang::prelude::*;

declare_id!("AjRPUV96mR92DZMDGTrQmLBrNxbjXwn6mmQbMgyGPqAw"); // will auto-update when you deploy

#[program]
pub mod voting_dapp {
    use super::*;

    // Create a new proposal
    pub fn create_proposal(ctx: Context<CreateProposal>, description: String) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        proposal.creator = *ctx.accounts.creator.key;
        proposal.description = description;
        proposal.votes_yes = 0;
        proposal.votes_no = 0;
        proposal.is_active = true;
        Ok(())
    }

    // Vote on a proposal
    pub fn vote(ctx: Context<VoteProposal>, choice: bool) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;

        // Ensure the proposal is still open
        require!(proposal.is_active, VotingError::ProposalClosed);

        // Record this wallet’s vote
        let vote = &mut ctx.accounts.vote;
        vote.proposal = proposal.key();
        vote.voter = *ctx.accounts.voter.key;
        vote.choice = choice;

        // Update tally
        if choice {
            proposal.votes_yes += 1;
        } else {
            proposal.votes_no += 1;
        }

        Ok(())
    }

    // Close proposal (only creator can close)
    pub fn close_proposal(ctx: Context<CloseProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.creator == *ctx.accounts.creator.key, VotingError::Unauthorized);
        proposal.is_active = false;
        Ok(())
    }
}

// ----------------- ACCOUNTS -----------------

#[account]
pub struct Proposal {
    pub creator: Pubkey,
    pub description: String,
    pub votes_yes: u64,
    pub votes_no: u64,
    pub is_active: bool,
}

#[account]
pub struct Vote {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub choice: bool,
}

// ----------------- CONTEXTS -----------------

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(init, payer = creator, space = 8 + 32 + 200 + 8 + 8 + 1)]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VoteProposal<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(init, payer = voter, space = 8 + 32 + 32 + 1)]
    pub vote: Account<'info, Vote>,
    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseProposal<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    pub creator: Signer<'info>,
}

// ----------------- ERRORS -----------------

#[error_code]
pub enum VotingError {
    #[msg("Proposal is closed.")]
    ProposalClosed,
    #[msg("You are not the creator.")]
    Unauthorized,
}
