# M12 · Engagement Orchestration — low-level design

Status: Ready for build · Depends on: M03 (contactability, consent), M04 (activities, campaigns attribution), M07 (dues, lifecycle alerts), M11 (publish gate + disclosures) · Requirements: Rev 3.0 F10 (communication with approved templates and delivery status), F11 (campaign execution: IDs, simple audiences, approved content, scheduling, attribution), F80 (WhatsApp-first: click-to-chat for Solo, Business API templates for tenants, opt-out handling), F82 (greetings/social creatives), F83 (vernacular templates), F37 (suppression rechecked at send time); TRAI/DLT rules [S22] · HLD §9 Messaging port ("templates and opt-outs held in Core so a provider change moves no consent data") · Screens: CRM06 `CRMCampaigns`, M12 `Message`, `CampaignPublish`

## 1. Responsibilities
- **Template registry**: per tenant, per channel (WHATSAPP, SMS, EMAIL) and language; WhatsApp templates carry the provider approval status and category (UTILITY / MARKETING); SMS templates carry the DLT template id and header (sender id) registered to the tenant entity. Variables are typed placeholders; free text is never sent on templated channels.
- **Send pipeline** (Chain of Responsibility, evaluated at send time, not schedule time): template approved → publish gate (M11) for MARKETING content with product claims → **contactability** (M03, purpose by template category) → quiet hours (21:00–09:00 IST for MARKETING; TRAI) → frequency cap (≤ 2 marketing messages per party per 7 days) → provider send through the **Messaging port** → delivery receipts.
- **Reminder schedules**: due reminders (M07 dues: 7 days before, on the due date, last day of grace), lifecycle alerts (M07), renewal reminders; each reminder is a scheduled message with a stable dedup key.
- **Campaigns** (F11): simple audiences (filters over party tags, held-policy line, due status, lead stage — no sensitive profiling), approved content only, scheduling, campaign id carried into lead capture attribution (M04).
- **Click-to-chat** for Solo (F80): generates a `wa.me` link with a prefilled approved text — no provider call, no delivery status, still consent-checked and logged as an activity.
- **Communication log**: every send/receipt becomes an M04 activity (`WHATSAPP`/`SMS`/`EMAIL`) on the party/lead with template id and status — never the rendered body for MARKETING beyond the template id + variables hash.

## 2. Module layout
```
apps/core/src/modules/engagement/
  domain/ template.ts, send-rules.ts (Chain), quiet-hours.ts, frequency-cap.ts, reminder-schedule.ts, campaign.ts (State: DRAFT → SCHEDULED → RUNNING → COMPLETED | CANCELLED), audience.ts (Specification over party facts), message.ts (QUEUED → SENT → DELIVERED | READ | FAILED | BLOCKED(reason)), click-to-chat.ts, events.ts
  application/ ports.ts (MessagingPort, DeliveryReceiptVerifier), template.service.ts, send.service.ts, reminder.job.ts, campaign.service.ts, receipt.service.ts, click-to-chat.service.ts, subscribers.ts
  infrastructure/ fake-messaging.adapter.ts (records sends; scriptable failures), in-memory + pg repositories
  api/ templates.controller.ts, messages.controller.ts, campaigns.controller.ts, receipts.controller.ts (public, verified)
  engagement.module.ts
apps/core/migrations/120_engagement.sql
apps/web/src/features/engagement/
```

## 3. Key rules
```ts
export interface SendRule { readonly name: string; evaluate(ctx: SendContext): BlockReason | undefined }
export type BlockReason = 'template_not_approved' | 'publish_blocked' | 'not_contactable' | 'quiet_hours' | 'frequency_cap' | 'no_contact_point' | 'provider_unavailable';
// TemplateApprovedRule → PublishGateRule (MARKETING with productVersionIds) → ContactabilityRule (M03 decideIn: UTILITY → SERVICE, MARKETING → MARKETING) → QuietHoursRule (MARKETING only; rescheduled to 09:00 IST next allowed time instead of dropped) → FrequencyCapRule (MARKETING only) → send
export interface MessagingPort { send(msg: { tenantId; channel; to: string /* decrypted at the edge of the adapter call only */; templateRef: string; variables: Record<string, string>; idempotencyKey: string }): Promise<{ providerMessageId: string }> }
```
Decryption of the destination happens inside `SendService` immediately before the port call (M03 protected accessor with purpose `SERVICING`/`MARKETING`) and is never logged or stored with the message.

## 4. Application services
| Service | Behaviour |
|---|---|
| `TemplateService` | CRUD templates (DRAFT → SUBMITTED → APPROVED/REJECTED from provider callback or manual for SMS DLT), variable schema, languages EN/HI + two regional; only APPROVED usable |
| `SendService` | `send(tx, { partyId, templateId, variables, purpose, dedupKey })` → message with status or BLOCKED(reason); quiet-hours reschedule; activity log; events `engagement.message.sent/blocked/delivered/failed` (ids, channel, template id, reason) |
| `ReminderJob` | daily 08:00 IST per tenant: due reminders and lifecycle alerts → `send` with dedup keys `${policyId}:${kind}:${date}`; backlog metric (monitor at 08:00, HLD §16) |
| `CampaignService` | audience preview (counts only), schedule, run in batches of 500 with per-batch transaction, pause/cancel, results (sent, blocked by reason, delivered, leads attributed via campaignId) |
| `ReceiptService` | provider delivery/read receipts (HMAC verified, inbox dedup) → message status; inbound "STOP"/opt-out keywords → M03 consent withdrawal (MARKETING, channel) → suppression |
| `ClickToChatService` | approved text + variables → `https://wa.me/<e164>?text=<encoded>` after contactability check; activity logged |

## 5. API (`/api/v1`)
`GET/POST ✱/PUT /message-templates` (`engagement.template.write` for admin), `POST ✱ /messages` (`engagement.send` — single send to a party; response includes status or block reason), `POST ✱ /click-to-chat-links` (`engagement.send`), `GET /messages?partyId=` (`engagement.read`), `GET/POST ✱ /campaigns`, `POST ✱ /campaigns/{id}/audience-preview|schedule|pause|cancel`, `GET /campaigns/{id}/results`, public `POST /webhooks/messaging/{provider}` (verified receipts and inbound opt-outs).
Permissions: sellers → `engagement.send, engagement.read`; managers/TENANT_ADMIN → `engagement.*`; `CMS_PUBLISHER → engagement.template.write`.

## 6. DDL — `120_engagement.sql`
`message_template`, `message` (no body column; template id + variables hash + status timeline), `message_status_event`, `reminder_dedup` (pk tenant+key), `campaign`, `campaign_run_batch`; RLS on all.

## 7. Observability
Metrics `engagement_messages_total{channel,category,outcome}`, `engagement_blocked_total{reason}`, `engagement_reminder_backlog` (gauge, monitor at 08:00), `engagement_delivery_seconds` histogram; logs never contain destinations or rendered text.

## 8. Frontend
CRM06 `CampaignsScreen` (list, builder: audience filters with live count, template picker (approved only), schedule, results with block reasons), M12 `MessageSheet` (from lead/customer/due: template select, variable preview, send or click-to-chat for Solo, block reason shown), templates admin.

## 9. Acceptance criteria
- **AC-M12-01** Only approved templates send; variables validated; SMS requires DLT template id and tenant header.
- **AC-M12-02** Send-time chain: publish-blocked marketing, not-contactable party, quiet hours (rescheduled to 09:00 IST), frequency cap — each blocks with its reason in that precedence; UTILITY uses SERVICE purpose.
- **AC-M12-03** Suppression added after scheduling still blocks the send (rechecked at send time).
- **AC-M12-04** Inbound STOP withdraws MARKETING consent for that channel and suppresses the number.
- **AC-M12-05** Reminder job sends due/lifecycle reminders once per dedup key; backlog metric exposed.
- **AC-M12-06** Campaign audiences use non-sensitive filters only; batches are transactional; results by outcome; campaign id flows into lead attribution.
- **AC-M12-07** Click-to-chat link uses approved text, is consent-checked and logged; no provider call.
- **AC-M12-08** Receipts are verified, deduplicated, and update message status; destinations and rendered text never appear in logs or the message table (canary test).
- **AC-M12-09** Postgres: migration, RLS, reminder dedup uniqueness. *(integration)*
- **AC-M12-10** Campaigns screen and message sheet as in §8.
