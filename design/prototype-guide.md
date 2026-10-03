# Prototype guide

Start at `Start.dc.html` (“Prototype home”). Pick a role or follow a guided journey; links inside screens move to the next screen. Return with “⌂ Prototype map” (console sidebar, or the agent app’s Me tab).

## Guided journeys
1. **From lead to issued policy:** CRMLeads → CRMLeadDetail → Calculators → QuoteBI → ProposalForm → CustomerJourney → PortalFillSheet → IssuanceTracker → CRMCustomerRecord
2. **A solo agent’s first day:** SoloSignup → BookImport → DueCalendar → Main → AIDraft → MicrositeGreetings → HelpCentre → SoloPlan
3. **A manager runs the branch:** ManagerConsole → CRMTasks → CRMAssignment → OnboardingHierarchy → ProductDrives → ReportsLibrary
4. **Compliance by design:** CampaignPublish → ComplianceCentre → NeedsCompare → AIControls → UsersRoles → FormTemplates
5. **Launch a white-label tenant:** OperatorTenants → TenantSetup → WhiteLabel → Configuration → Integrations → ContentLibrary

## State that carries across screens (browser local storage)
`ui-lang` (agent app language) · `proto.imported` (book import → calendar) · `proto.biAck` (quote → proposal) · `proto.submitted` / `proto.portal` (proposal → tracker) · `proto.converted` (lead → pipeline) · `proto.newLead` (new lead → tasks). “Reset demo” on the home screen clears them. Everything else resets when you leave a screen.

Insurer, customer and payment events are simulated with buttons marked “Demo”. Sample data is illustrative.
