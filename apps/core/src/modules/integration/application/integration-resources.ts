import { Inject, Injectable } from '@nestjs/common';
import * as ports from './ports';
@Injectable()
export class IntegrationResources {
  constructor(
  @Inject(ports.ADAPTER_REGISTRY)
  readonly registry: ports.AdapterRegistry,
  @Inject(ports.CREDENTIAL_VAULT)
  readonly vault: ports.CredentialVault,
  @Inject(ports.PIN_REPOSITORY)
  readonly pins: ports.PinRepository,
  @Inject(ports.CERTIFICATION_REPOSITORY)
  readonly certifications: ports.CertificationRepository,
  @Inject(ports.BREAKER_STATE_STORE)
  readonly breakers: ports.BreakerStateStore,
  @Inject(ports.INTEGRATION_CALL_LOG)
  readonly calls: ports.IntegrationCallLog,
  @Inject(ports.INSURER_URL_ALLOWLIST)
  readonly allowlist: ports.InsurerUrlAllowlist,
  @Inject(ports.INTEGRATION_HEALTH_REPOSITORY)
  readonly health: ports.IntegrationHealthRepository) { }
}
@Injectable()
export class IntegrationWork {
  constructor(
  @Inject(ports.SUBMISSION_REPOSITORY)
  readonly submissions: ports.SubmissionRepository,
  @Inject(ports.DEAD_LETTER_REPOSITORY)
  readonly letters: ports.DeadLetterRepository,
  @Inject(ports.ENCRYPTED_PAYLOAD_REPOSITORY)
  readonly payloads: ports.EncryptedPayloadRepository,
  @Inject(ports.CALLBACK_REPOSITORY)
  readonly callbacks: ports.CallbackRepository) { }
}
