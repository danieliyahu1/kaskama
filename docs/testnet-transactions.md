# Testnet Transaction Ledger

Kaskama uses Kaspa testnet-10 for development and verification. Test fixtures
use synthetic transaction identifiers and do not represent spendable funds.

Before any testnet transaction is submitted manually, record its transaction
ID, purpose, wallet, and status in this file. Transactions that are abandoned
must remain listed with the reason and the last observed node status; never
reuse an abandoned transaction as a production fixture.

| Transaction ID | Purpose | Wallet | Status | Notes |
| --- | --- | --- | --- | --- |
| `b89bc703baf1e8773ad8ccd3461f260fbe34c231ebbe02af673baa180efdb5c3` | Referral split: 200 KAS post, 2 KAS fee halves to referrer and platform | creator `qpchy...`, buyer `qpg2...`, referrer `qzexf...` | Accepted (testnet-10) | 4 outputs: 198 KAS creator, 1 KAS referrer, 1 KAS platform, change. First live agent-flow check of the referral feature. |
| `62bef119be5c963647cf3e22feeefff336521488b0d829c0191a61d4416b1d24` | Referral split re-check: 200 KAS post, 2 KAS fee halves to referrer and platform | creator `qpchy...`, buyer `qpg2...`, referrer `qzexf...` | Accepted (testnet-10) | 4 outputs: 198 KAS creator, 1 KAS referrer, 1 KAS platform, change. Re-run after the payment-split refactor. |
| `9d8674fe8c3f79e672381f19aae314244ccbed6737694b85d694c3e4b2268082` | Sub-minimum referral: 100 KAS post, 1 KAS fee cannot split | creator `qpchy...`, buyer `qpg2...`, referrer `qzexf...` | Accepted (testnet-10) | 3 outputs: 99 KAS creator, 1 KAS platform, change. Payload records no referrer; the platform keeps the whole fee. |
