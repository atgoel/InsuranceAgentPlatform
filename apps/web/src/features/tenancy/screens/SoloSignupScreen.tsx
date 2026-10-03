import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import {
  Button,
  Card,
  Stepper,
  ConsentCheckbox,
  ErrorState,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createTenancyApi, LineOfBusiness } from '../api';
import '../styles/SoloSignupScreen.css';

interface Step0Props {
  phone: string;
  displayName: string;
  insurerName: string;
  line: LineOfBusiness;
  licenceNo: string;
  consentAccepted: boolean;
  loading: boolean;
  otpError?: string;
  onPhoneChange: (phone: string) => void;
  onDisplayNameChange: (name: string) => void;
  onInsurerNameChange: (name: string) => void;
  onLineChange: (line: LineOfBusiness) => void;
  onLicenceNoChange: (no: string) => void;
  onConsentChange: (accepted: boolean) => void;
  onContinue: () => void;
  t: ReturnType<typeof useT>['t'];
}

function Step0Form(props: Step0Props) {
  return (
    <Card title={props.t('tenancy.signup.details_title')}>
      <div className="form-section">
        <label>
          <span>{props.t('tenancy.signup.phone')}</span>
          <input
            type="tel"
            value={props.phone}
            onChange={e => props.onPhoneChange(e.target.value)}
            placeholder="+91 XXXXX XXXXX"
          />
        </label>

        <label>
          <span>{props.t('tenancy.signup.name')}</span>
          <input
            type="text"
            value={props.displayName}
            onChange={e => props.onDisplayNameChange(e.target.value)}
          />
        </label>

        <label>
          <span>{props.t('tenancy.signup.insurer_name')}</span>
          <input
            type="text"
            value={props.insurerName}
            onChange={e => props.onInsurerNameChange(e.target.value)}
          />
        </label>

        <label>
          <span>{props.t('tenancy.signup.line')}</span>
          <select
            value={props.line}
            onChange={e => props.onLineChange(e.target.value as LineOfBusiness)}
          >
            <option value="LIFE">{props.t('tenancy.signup.line_life')}</option>
            <option value="HEALTH">{props.t('tenancy.signup.line_health')}</option>
            <option value="GENERAL">{props.t('tenancy.signup.line_general')}</option>
          </select>
        </label>

        <label>
          <span>{props.t('tenancy.signup.licence_no')}</span>
          <input
            type="text"
            value={props.licenceNo}
            onChange={e => props.onLicenceNoChange(e.target.value)}
          />
        </label>

        <ConsentCheckbox
          purpose="signup"
          noticeVersion="1.0"
          checked={props.consentAccepted}
          onChange={props.onConsentChange}
          label={props.t('tenancy.signup.consent_label')}
        />

        {props.otpError && (
          <div className="error-message">{props.otpError}</div>
        )}

        <Button
          onClick={props.onContinue}
          loading={props.loading}
          disabled={!props.consentAccepted}
          size="lg"
        >
          {props.t('tenancy.signup.continue')}
        </Button>
      </div>
    </Card>
  );
}

interface Step1Props {
  otp: string;
  phone: string;
  loading: boolean;
  otpError?: string;
  onOtpChange: (otp: string) => void;
  onVerify: () => void;
  onCancel: () => void;
  t: ReturnType<typeof useT>['t'];
}

function Step1Form(props: Step1Props) {
  return (
    <Card title={props.t('tenancy.signup.otp_title')}>
      <div className="form-section">
        <p>{props.t('tenancy.signup.otp_description', { phone: props.phone })}</p>

        <label>
          <span>{props.t('tenancy.signup.otp_code')}</span>
          <input
            type="text"
            value={props.otp}
            onChange={e => props.onOtpChange(e.target.value.slice(0, 6))}
            placeholder="000000"
            maxLength={6}
          />
        </label>

        {props.otpError && (
          <div className="error-message">{props.otpError}</div>
        )}

        <Button
          onClick={props.onVerify}
          loading={props.loading}
          size="lg"
        >
          {props.t('tenancy.signup.verify')}
        </Button>

        <Button
          variant="ghost"
          onClick={props.onCancel}
        >
          {props.t('common.cancel')}
        </Button>
      </div>
    </Card>
  );
}

interface Step2Props {
  t: ReturnType<typeof useT>['t'];
  onImportBook: () => void;
  onSkip: () => void;
}

function Step2Success(props: Step2Props) {
  return (
    <Card title={props.t('tenancy.signup.success_title')}>
      <div className="success-section">
        <div className="success-icon">✓</div>
        <p>{props.t('tenancy.signup.success_message')}</p>

        <div className="next-steps">
          <Button
            onClick={props.onImportBook}
            size="lg"
          >
            {props.t('tenancy.signup.import_book')}
          </Button>
          <Button
            variant="secondary"
            onClick={props.onSkip}
          >
            {props.t('tenancy.signup.skip_today')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function SoloSignupScreen() {
  const api = useApi();
  const tenancyApi = useMemo(() => createTenancyApi(api), [api]);
  const navigate = useNavigate();
  const { t } = useT();

  const [step, setStep] = useState(0); // 0: phone/licence, 1: otp, 2: success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | undefined>();
  const [otpError, setOtpError] = useState<string | undefined>();

  // Step 0 form data
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [insurerName, setInsurerName] = useState('');
  const [line, setLine] = useState<LineOfBusiness>('LIFE');
  const [licenceNo, setLicenceNo] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);

  // Step 1 data
  const [signupId, setSignupId] = useState('');
  const [otp, setOtp] = useState('');
  const [otpAttempts, setOtpAttempts] = useState(0);

  const handleStartSignup = async () => {
    if (!consentAccepted) {
      setOtpError(t('tenancy.signup.consent_required'));
      return;
    }

    setLoading(true);
    setOtpError(undefined);

    try {
      const result = await tenancyApi.startSoloSignup({
        phone,
        displayName,
        licence: { insurerName, line, licenceNo },
        consent: { noticeVersion: '1.0', accepted: true },
      });

      setSignupId(result.signupId);
      setStep(1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOtpError = (err: ApiError) => {
    if (err.code === 'otp_invalid') {
      const newAttempts = otpAttempts + 1;
      setOtpAttempts(newAttempts);
      setOtpError(
        t('tenancy.signup.otp_invalid', { attempts: newAttempts })
      );
    } else if (err.code === 'otp_locked') {
      setOtpError(t('tenancy.signup.otp_locked'));
    } else if (err.code === 'otp_expired') {
      setOtpError(t('tenancy.signup.otp_expired'));
    } else {
      setError(err);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setOtpError(t('tenancy.signup.otp_format'));
      return;
    }

    setLoading(true);
    setOtpError(undefined);

    try {
      await tenancyApi.verifySoloSignup(signupId, { otp });
      setStep(2);
    } catch (err) {
      if (err instanceof ApiError) {
        handleOtpError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const steps: Array<{ id: string; label: string; state: 'done' | 'current' | 'todo' }> = [
    { id: 'details', label: t('tenancy.signup.step_details'), state: step === 0 ? 'current' : step > 0 ? 'done' : 'todo' },
    { id: 'otp', label: t('tenancy.signup.step_otp'), state: step === 1 ? 'current' : step > 1 ? 'done' : 'todo' },
    { id: 'success', label: t('tenancy.signup.step_success'), state: step === 2 ? 'current' : step > 2 ? 'done' : 'todo' },
  ];

  if (error && step !== 0) {
    return <ErrorState error={error} />;
  }

  return (
    <div className="solo-signup-screen">
      <div className="signup-container">
        <Stepper steps={steps} />

        {step === 0 && (
          <Step0Form
            phone={phone}
            displayName={displayName}
            insurerName={insurerName}
            line={line}
            licenceNo={licenceNo}
            consentAccepted={consentAccepted}
            loading={loading}
            otpError={otpError}
            onPhoneChange={setPhone}
            onDisplayNameChange={setDisplayName}
            onInsurerNameChange={setInsurerName}
            onLineChange={setLine}
            onLicenceNoChange={setLicenceNo}
            onConsentChange={setConsentAccepted}
            onContinue={handleStartSignup}
            t={t}
          />
        )}

        {step === 1 && (
          <Step1Form
            otp={otp}
            phone={phone}
            loading={loading}
            otpError={otpError}
            onOtpChange={setOtp}
            onVerify={handleVerifyOtp}
            onCancel={() => setStep(0)}
            t={t}
          />
        )}

        {step === 2 && (
          <Step2Success
            t={t}
            onImportBook={() => navigate('/m/book/import')}
            onSkip={() => navigate('/m/today')}
          />
        )}
      </div>
    </div>
  );
}
