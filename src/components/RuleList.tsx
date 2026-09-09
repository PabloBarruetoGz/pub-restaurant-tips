import type { RuleCheck } from '../domain'

type RuleListProps = {
  rules: RuleCheck[]
}

export function RuleList({ rules }: RuleListProps) {
  return (
    <div className="rule-list" aria-label="Validacion de reglas de negocio">
      {rules.map((rule) => (
        <div className={rule.ok ? 'rule rule-ok' : 'rule rule-blocked'} key={rule.label}>
          <span>{rule.ok ? 'OK' : 'Bloqueado'}</span>
          <div>
            <strong>{rule.label}</strong>
            <p>{rule.detail}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
