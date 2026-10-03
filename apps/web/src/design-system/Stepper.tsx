import './Stepper.css';

export interface StepDef {
  id: string;
  label: string;
  state: 'done' | 'current' | 'todo';
}

export interface StepperProps {
  steps: StepDef[];
}

export function Stepper({ steps }: StepperProps) {
  return (
    <div className="stepper">
      {steps.map((step, idx) => (
        <div key={step.id} className="stepper-item">
          <div className={`stepper-badge step-${step.state}`}>{idx + 1}</div>
          <div className="stepper-label">{step.label}</div>
          {idx < steps.length - 1 && <div className="stepper-line" />}
        </div>
      ))}
    </div>
  );
}
