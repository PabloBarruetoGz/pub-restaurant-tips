type StatCardProps = {
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warn'
}

export function StatCard({ label, value, tone = 'neutral' }: StatCardProps) {
  return (
    <article className={`stat stat-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
