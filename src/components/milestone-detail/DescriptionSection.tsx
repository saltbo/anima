interface DescriptionSectionProps {
  description: string
}

export function DescriptionSection({ description }: DescriptionSectionProps) {
  if (!description) return null

  return (
    <div className="pr-6 pt-5 pb-4 border-b border-border shrink-0">
      <p className="text-sm text-foreground leading-relaxed">{description}</p>
    </div>
  )
}
