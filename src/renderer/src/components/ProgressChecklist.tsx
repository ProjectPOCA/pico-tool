import type { FlashStep } from '@shared/types'

export function ProgressChecklist(props: { steps: FlashStep[] }): React.JSX.Element {
  return (
    <div className="checklist">
      {props.steps.map((step) => (
        <div key={step.id} className={`checklist__row checklist__row--${step.state}`}>
          <span className="checklist__dot" />
          <span className="checklist__label">{step.label}</span>
        </div>
      ))}
    </div>
  )
}
