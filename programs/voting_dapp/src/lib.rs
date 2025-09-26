use anchor_lang::prelude::*;


#[event]
pub struct ProposalCreated {
    pub proposal: Pubkey,
    pub creator: Pubkey,
    pub start_ts: i64,
    pub end_ts: i64,
}

#[event]
pub struct VoteCast {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub choice: bool,
}

#[event]
pub struct ProposalClosed {
    pub proposal: Pubkey,
    pub votes_yes: u64,
    pub votes_no: u64,
    pub end_ts: i64,
}

const MAX_DESCRIPTION_LEN: usize = 200;

declare_id!("FotkyW5saNF7jWoJXZm4yDcEabcCkUnZPB2RQa7hJJZr"); // update if redeployed
#[program]
pub mod voting_dapp {
    use super::*;

    // Create a new proposal
    pub fn create_proposal(ctx: Context<CreateProposal>, description: String, duration_sec: i64,) -> Result<()> {
        require!(description.len() <= MAX_DESCRIPTION_LEN, VotingError::DescriptionTooLong);
        require!(duration_sec > 0, VotingError::InvalidDuration);

        let now = Clock::get()?.unix_timestamp;

        let proposal = &mut ctx.accounts.proposal;
        proposal.creator = *ctx.accounts.creator.key;
        proposal.description = description;
        proposal.votes_yes = 0;
        proposal.votes_no = 0;
        proposal.is_active = true;
        proposal.start_ts = now;
        proposal.end_ts = now + duration_sec;

        emit!(ProposalCreated {
            proposal: proposal.key(),
            creator: ctx.accounts.creator.key(),
            start_ts: proposal.start_ts,
            end_ts: proposal.end_ts,
            });
        
        Ok(())
    }

    // Vote on a proposal
    pub fn vote(ctx: Context<VoteProposal>, choice: bool) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.is_active, VotingError::ProposalClosed);

        let now = Clock::get()?.unix_timestamp;
        require!(now < proposal.end_ts, VotingError::DeadlinePassed);
        
        // This will fail automatically on second attempt because pda already exists
        let vote = &mut ctx.accounts.vote;
        vote.proposal = proposal.key();
        vote.voter = *ctx.accounts.voter.key;
        vote.choice = choice;
        vote.bump = ctx.bumps.vote;

        // Update tally
        if choice {
            proposal.votes_yes += 1;
        } else {
            proposal.votes_no += 1;
        }
        
        emit!(VoteCast {
            proposal: proposal.key(),
            voter: ctx.accounts.voter.key(),
            choice,
        });
        Ok(())
    }

    // Close proposal (only creator can close)
    pub fn close_proposal(ctx: Context<CloseProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.creator == *ctx.accounts.creator.key, VotingError::Unauthorized);

        let now = Clock::get()?.unix_timestamp;
        require!(now >= proposal.end_ts, VotingError::TooEarlyToClose);

        proposal.is_active = false;
        emit!(ProposalClosed {
            proposal: proposal.key(),
            votes_yes: proposal.votes_yes,
            votes_no: proposal.votes_no,
            end_ts: proposal.end_ts,
        });
        Ok(())
    }
}

// ----------------- ACCOUNTS -----------------

#[account]
pub struct  Proposal {
    pub creator: Pubkey,
    pub description: String,
    pub votes_yes: u64,
    pub votes_no: u64,
    pub is_active: bool,
    pub start_ts: i64,
    pub end_ts: i64,
}

#[account]
pub struct Vote {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub choice: bool,
    pub bump: u8,
}

// ----------------- CONTEXTS -----------------

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(init, payer = creator, space = 8 + 32 + 4 + MAX_DESCRIPTION_LEN + 8 + 8 + 1 + 8 + 8 + 3)] // am adaugat + 3 pentru rotunjire sa avem 280
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct VoteProposal<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    // Using PDA to guarantee uniqueness: one (proposal, voter) pair
    #[account(
        init, 
        payer = voter, 
        space = 8 + 32 + 32 + 1 + 1, // discr + proposal + voter + choice
        seeds = [b"vote", proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
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
    #[msg("Description is too long")]
    DescriptionTooLong,
    #[msg("Invalid duration (must be > 0 ).")]
    InvalidDuration,    
    #[msg("Voting deadline is passed")]
    DeadlinePassed,
    #[msg("Too early to close.")]
    TooEarlyToClose,
}
