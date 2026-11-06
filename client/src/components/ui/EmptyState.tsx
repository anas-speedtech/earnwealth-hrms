interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export default function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
          {icon}
        </div>
      )}
      <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-[13px] text-slate-500">{description}</p>}
    </div>
  );
}
