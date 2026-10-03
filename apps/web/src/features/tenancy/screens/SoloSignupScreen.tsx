import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import {
  Button,
  Card,
  Stepper,
  ConsentCheckbox,
  LoadingSkeleton,
  ErrorState,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createTenancyApi, LineOfBusiness } from '../api';
import '../styles/SoloSignupScreen.css';

export function SoloSignupScreen() {
  const api = useApi();
  const tenancyApi = createTenancyApi(api);
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
  const [expiresAt, setExpiresAt] = useState('');
  const [otp, setOtp] = useState('');
  const [otpAttempts, setOtpAttempts] = useState(0);

  // Step 2 data
  const [tenantId, setTenantId] = useState('');
  const [host, setHost] = useState('');

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
      setExpiresAt(result.expiresAt);
      setStep(1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      }
    } finally {
      setLoading(false);
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
      const result = await tenancyApi.verifySoloSignup(signupId, { otp });
      setTenantId(result.tenantId);
      setHost(result.host);
      setStep(2);
    } catch (err) {
      if (err instanceof ApiError) {
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
      }
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { id: 'details', label: t('tenancy.signup.step_details'), state: step >= 0 ? (step === 0 ? 'current' : 'done') : 'todo' as const },
    { id: 'otp', label: t('tenancy.signup.step_otp'), state: step >= 1 ? (step === 1 ? 'current' : 'done') : 'todo' as const },
    { id: 'success', label: t('tenancy.signup.step_success'), state: step === 2 ? 'current' : (step > 2 ? 'done' : 'todo') as const },
  ];

  if (error && step !== 0) {
    return <ErrorState error={error} />;
  }

  return (
    <div className="solo-signup-screen">
      <div className="signup-container">
        <Stepper steps={steps} />

        {step === 0 && (
          <Card title={t('tenancy.signup.details_title')}>
            <div className="form-section">
              <label>
                <span>{t('tenancy.signup.phone')}</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                />
              </label>

              <label>
                <span>{t('tenancy.signup.name')}</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </label>

              <label>
                <span>{t('tenancy.signup.insurer_name')}</span>
                <input
                  type="text"
                  value={insurerName}
                  onChange={e => setInsurerName(e.target.value)}
                />
              </label>

              <label>
                <span>{t('tenancy.signup.line')}</span>
                <select
                  value={line}
                  onChange={e => setLine(e.target.value as LineOfBusiness)}
                >
                  <option value="LIFE">{t('tenancy.signup.line_life')}</option>
                  <option value="HEALTH">{t('tenancy.signup.line_health')}</option>
                  <option value="GENERAL">{t('tenancy.signup.line_general')}</option>
                </select>
              </label>

              <label>
                <span>{t('tenancy.signup.licence_no')}</span>
                <input
                  type="text"
                  value={licenceNo}
                  onChange={e => setLicenceNo(e.target.value)}
                />
              </label>

              <ConsentCheckbox
                purpose="signup"
                noticeVersion="1.0"
                checked={consentAccepted}
                onChange={setConsentAccepted}
                label={t('tenancy.signup.consent_label')}
              />

              {otpError && (
                <div className="error-message">{otpError}</div>
              )}

              <Button
                onClick={handleStartSignup}
                loading={loading}
                disabled={!consentAccepted}
                size="lg"
              >
                {t('tenancy.signup.continue')}
              </Button>
            </div>
          </Card>
        )}

        {step === 1 && (
          <Card title={t('tenancy.signup.otp_title')}>
            <div className="form-section">
              <p>{t('tenancy.signup.otp_description', { phone })}</p>

              <label>
                <span>{t('tenancy.signup.otp_code')}</span>
                <input
                  type="text"
                  value={otp}
                  onChange={e => setOtp(e.target.value.slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                />
              </label>

              {otpError && (
                <div className="error-message">{otpError}</div>
              )}

              <Button
                onClick={handleVerifyOtp}
                loading={loading}
                size="lg"
              >
                {t('tenancy.signup.verify')}
              </Button>

              <Button
                variant="ghost"
                onClick={() => setStep(0)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card title={t('tenancy.signup.success_title')}>
            <div className="success-section">
              <div className="success-icon">✓</div>
              <p>{t('tenancy.signup.success_message')}</p>

              <div className="next-steps">
                <Button
                  onClick={() => navigate('/m/book/import')}
                  size="lg"
                >
                  {t('tenancy.signup.import_book')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/m/today')}
                >
                  {t('tenancy.signup.skip_today')}
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
