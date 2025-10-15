#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken, 
    token_interface::{ Mint, TokenAccount, TransferChecked, TokenInterface, transfer_checked}
};

use crate::state::Escrow;

#[derive(Accounts)]
#[instruction(seed: u64)]
pub struct Make<'info> {
    #[account(mut)] 
    pub maker: Signer<'info>,

    #[account(
        init,
        payer = maker,
        seeds = [b"escrow", maker.key().as_ref(), seed.to_le_bytes().as_ref()],
        bump,
        space = 8 + Escrow::INIT_SPACE,
    )]
    pub escrow: Account<'info, Escrow>,

    // token accounts
    // The mint account specifying the type of token to be sent
    #[account(
        mint::token_program = token_program
    )]
    pub mint_a: InterfaceAccount<'info, Mint>,

    // The mint account specifying the type of token to be recieved
    #[account(
        mint::token_program = token_program
    )]
    pub mint_b: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = maker,
        associated_token::token_program = token_program
    )]
    pub maker_ata_a: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init, 
        payer = maker,
        associated_token::mint = mint_a,
        associated_token::authority = escrow,
        associated_token::token_program = token_program    
    )]
    // this vault is needed to Actually hold the tokens that are being escrowed (token A)
    pub vault: InterfaceAccount<'info, TokenAccount>,
    
    // programs
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,  
    pub system_program: Program<'info, System>,
}

impl<'info> Make<'info> {
    // initialises the escrow pda
    pub fn init_escrow(&mut self, seed: u64, bumps: &MakeBumps, recieve: u64) -> Result<()>{
        self.escrow.set_inner(Escrow { 
            seed: seed, 
            maker: self.maker.key(), 
            mint_a: self.mint_a.key(), 
            mint_b: self.mint_b.key(), 
            bump: bumps.escrow,
            recieve: recieve, 
        });

        Ok(())
    } 

    // transfer token A to vault
    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        let decimals = self.mint_a.decimals;

        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = TransferChecked{            
            mint: self.mint_a.to_account_info(),
            from: self.maker_ata_a.to_account_info(),
            to: self.vault.to_account_info(),
            authority: self.maker.to_account_info(),
        };

        let cpi_context = CpiContext::new(cpi_program, cpi_accounts);

        transfer_checked(cpi_context, amount, decimals)
    }
}