type FormatHintProps = {
  title: string
  headers: string[]
  example: string
}

export function FormatHint({ title, headers, example }: FormatHintProps) {
  return (
    <div className="format-hint">
      <strong>{title}</strong>
      <div className="format-grid">
        {headers.map((header) => (
          <span key={header}>{header}</span>
        ))}
      </div>
      <code>{example}</code>
    </div>
  )
}
