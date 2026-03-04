import MDEditor from '@uiw/react-md-editor'
import { useTheme } from '@/store/theme'

interface DescriptionSectionProps {
  description: string
}

export function DescriptionSection({ description }: DescriptionSectionProps) {
  const { resolvedTheme } = useTheme()

  if (!description) return null

  return (
    <div className="pr-6 pt-5 pb-4 border-b border-border shrink-0" data-color-mode={resolvedTheme}>
      <MDEditor.Markdown source={description} className="!bg-transparent !text-sm !leading-relaxed" />
    </div>
  )
}
