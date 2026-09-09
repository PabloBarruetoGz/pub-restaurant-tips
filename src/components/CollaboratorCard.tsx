import { currency, type Collaborator } from '../domain'

type CollaboratorCardProps = {
  collaborator: Collaborator
  amount: number
  shiftLabel: string
}

export function CollaboratorCard({ collaborator, amount, shiftLabel }: CollaboratorCardProps) {
  return (
    <article className="collaborator-card">
      <div>
        <strong>{collaborator.name}</strong>
        <span>{collaborator.position}</span>
      </div>
      <p>{shiftLabel}</p>
      <b>{currency(amount)}</b>
    </article>
  )
}
