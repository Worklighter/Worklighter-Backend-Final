enum TransactionPurpose {
    INITIAL_SUBSCRIPTION   = 'initial_subscription',   // First payment when subscribing
    SUBSCRIPTION_RENEWAL   = 'subscription_renewal',   // Recurring periodic charge
    PLAN_UPGRADE           = 'plan_upgrade',            // Upgrade to a higher tier
    PLAN_DOWNGRADE         = 'plan_downgrade',          // Downgrade to a lower tier
    BILLING_CYCLE_CHANGE   = 'billing_cycle_change',   // Switch between monthly / yearly
    REACTIVATION           = 'reactivation',            // Re-subscribe after cancellation
    REFUND                 = 'refund',                  // Full or partial refund
}

export default TransactionPurpose;
