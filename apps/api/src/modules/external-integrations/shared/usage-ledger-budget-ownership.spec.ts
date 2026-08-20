import { UsageLedgerService } from './usage-ledger.service';
import { GovernanceService } from '../governance/governance.service';
import { SpendCampaignService } from './spend-campaign.service';

/**
 * THE WORKER-BOOT BUDGET-OWNER REFUSAL (ledger 12d residual, lens-D).
 *
 * governance/spendCampaigns are @Optional() on the ledger so slim script
 * graphs can record without the governance module. The refusal closes the
 * fail-open half: a WORKER-capable runtime (unattended spend lanes) must own
 * both budget services or refuse to boot — a worker whose graph silently
 * lost them would write ledger rows that drain no pool and debit no
 * envelope. Both directions are proven here: the refusal fires, and the slim
 * script graph stays legal.
 */

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

function ledgerWith(deps: {
  governance?: GovernanceService;
  spendCampaigns?: SpendCampaignService;
}): UsageLedgerService {
  return new UsageLedgerService(
    {} as never, // prisma — never touched by the assertion
    logger,
    deps.governance,
    deps.spendCampaigns,
    undefined,
  );
}

const governance = {} as GovernanceService;
const spendCampaigns = {} as SpendCampaignService;

describe('worker-boot budget-owner refusal', () => {
  it('a worker-capable runtime WITHOUT budget owners refuses to boot, naming both', () => {
    expect(() => ledgerWith({}).assertBudgetOwnership(true)).toThrow(
      /REFUSING TO BOOT[\s\S]*GovernanceService[\s\S]*SpendCampaignService/,
    );
  });

  it('a worker-capable runtime missing only ONE owner still refuses, naming the missing one', () => {
    expect(() =>
      ledgerWith({ governance }).assertBudgetOwnership(true),
    ).toThrow(/SpendCampaignService/);
    expect(() =>
      ledgerWith({ spendCampaigns }).assertBudgetOwnership(true),
    ).toThrow(/GovernanceService/);
  });

  it('a worker-capable runtime WITH both owners boots (the full graph is legal)', () => {
    expect(() =>
      ledgerWith({ governance, spendCampaigns }).assertBudgetOwnership(true),
    ).not.toThrow();
  });

  it('a non-worker runtime keeps its slim graph — scripts are not workers', () => {
    expect(() => ledgerWith({}).assertBudgetOwnership(false)).not.toThrow();
  });
});
