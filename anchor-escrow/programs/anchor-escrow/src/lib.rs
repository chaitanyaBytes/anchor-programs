#![allow(unexpected_cfgs)]
#![allow(deprecated)]
use anchor_lang::prelude::*;

pub mod instructions;
pub use instructions::*;

pub mod state;
pub use state::*;

pub mod error;
pub use error::EscrowError;

declare_id!("HqnyaLuWCkBbQwcLN62TGWdU7CuMt1uwopAiwvQJAPSL");

#[program]
pub mod anchor_escrow {
    use super::*;

    pub fn make(ctx: Context<Make>, seed: u64, amount: u64, recieve: u64) -> Result<()> {
        require_gt!(recieve, 0, EscrowError::InvalidAmount);
        require_gt!(amount, 0, EscrowError::InvalidAmount);

        ctx.accounts.init_escrow(seed, &ctx.bumps, recieve)?;
        ctx.accounts.deposit(amount)
    }

    pub fn take(ctx: Context<Take>) -> Result<()> {
        ctx.accounts.transfer_to_maker()?;
        ctx.accounts.withdraw_and_close()?;

        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        ctx.accounts.refund_and_close_vault()?;

        Ok(())
    }
}
