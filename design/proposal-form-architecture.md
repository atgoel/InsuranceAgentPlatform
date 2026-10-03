# Proposal form architecture

Extends design Revision 3.0 (F16 proposal forms; data model “versioned JSON for insurer proposal answers”; insurer/product module owns proposal questions; submit contract with frozen declarations; assisted portal route). Recommended for inclusion as Revision 3.1.

1. **Three layers.** Core questions asked once per person (identity, contact, occupation, income, tax residency, nominee, payer); product packs (term, savings, health per member, motor); insurer-only extras. Each insurer form version maps every field to a canonical key, an insurer field code and a value mapping.
2. **Storage.** Answers are facts on the party with source, confirmer and time. A proposal freezes a versioned JSON snapshot mapped to the chosen insurer form version; relational keys elsewhere.
3. **Least effort.** Prefill from Customer 360, ID scans (F49), needs analysis, held and previous policies, household; confirm whole sections; jump to the next unfinished item; switching insurer reuses answers and asks only the delta; insurer underwriting rules shown inline.
4. **Who answers.** Health and lifestyle declarations are answered and confirmed only by the customer (secure link, or hand-over with OTP). Salespeople and AI never type them. F52 proposal AI stays later scope.
5. **Output.** One mapped snapshot becomes the API payload (contracted insurers, F18) or the assisted portal fill sheet in the insurer’s field order. Submission keeps the idempotency key; issuance waits for the insurer.
6. **Change control.** New insurer form versions are diffed against the live version, mapped, then published with an effective date; open proposals keep their frozen version.
7. **Privacy.** Health data is sensitive personal data: encrypted fields, need-to-know access, never in URLs. Review with Inadev’s CISO and compliance team before the pilot.

Screens: `ProposalForm.dc.html` (mobile), `PortalFillSheet.dc.html` (proposal desk), `FormTemplates.dc.html` (question bank and mapping).
