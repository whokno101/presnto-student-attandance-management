/** Title + description on the left, primary action on the right. */
export default function PageHeader({ title, description, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1.5">
        <h2 className="font-display text-[1.75rem] font-bold leading-none tracking-[0.01em] sm:text-[2rem]">{title}</h2>
        {description ? <p className="max-w-prose text-[0.95rem] text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}
