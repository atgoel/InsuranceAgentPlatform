import { Inject, Injectable } from '@nestjs/common';
import { FIELD_CIPHER, FieldCipher } from '../../party/application/ports';
import { MEMBER_REPOSITORY, MemberRepository, INSURER_CODE_REPOSITORY, InsurerCodeRepository } from '../../distribution/application/ports';
import { COMMISSION_IMPORT_PORT, CommissionImportPort } from '../../commission/application/ports';
import { HELD_POLICY_REPOSITORY, HeldPolicyRepository, SERVICING_REPOSITORY, ServicingRepository, IMPORT_BATCH_REPOSITORY, ImportBatchRepository } from './ports';

/** The policy use cases share one persistence/identity dependency set. */
@Injectable()
export class BookPolicyResources {
    constructor(
        @Inject(HELD_POLICY_REPOSITORY) readonly policies: HeldPolicyRepository,
        @Inject(FIELD_CIPHER) readonly cipher: FieldCipher,
        @Inject(SERVICING_REPOSITORY) readonly servicing: ServicingRepository,
        @Inject(MEMBER_REPOSITORY) readonly members: MemberRepository,
        @Inject(INSURER_CODE_REPOSITORY) readonly codes: InsurerCodeRepository,
    ) {}
}

/** Import writes stay on the caller's transaction through these published ports. */
@Injectable()
export class BookImportResources {
    constructor(
        @Inject(IMPORT_BATCH_REPOSITORY) readonly batches: ImportBatchRepository,
        @Inject(HELD_POLICY_REPOSITORY) readonly policies: HeldPolicyRepository,
        @Inject(FIELD_CIPHER) readonly cipher: FieldCipher,
        @Inject(COMMISSION_IMPORT_PORT) readonly commissions: CommissionImportPort,
    ) {}
}
