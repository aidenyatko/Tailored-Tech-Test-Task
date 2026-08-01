import { FormEvent, useEffect, useState } from "react";

interface WorkspaceDialogProps {
  title: string;
  description?: string;
  initialValue?: string;
  confirmLabel: string;
  destructive?: boolean;
  inputLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void | Promise<void>;
}

export function WorkspaceDialog({
  title,
  description,
  initialValue = "",
  confirmLabel,
  destructive = false,
  inputLabel = "Name",
  onCancel,
  onConfirm
}: WorkspaceDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    await onConfirm(value);
    setIsSubmitting(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/35 px-4 py-6">
      <form
        aria-label={title}
        className="w-full max-w-md rounded border border-mist bg-white p-5 shadow-panel"
        onSubmit={handleSubmit}
      >
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-steel">{description}</p> : null}
        {!destructive ? (
          <label className="mt-5 block text-sm font-medium text-ink">
            {inputLabel}
            <input
              autoFocus
              className="mt-2 w-full rounded border border-mist px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              maxLength={120}
              onChange={(event) => setValue(event.target.value)}
              value={value}
            />
          </label>
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="rounded border border-mist bg-white px-4 py-2 text-sm font-medium text-steel transition hover:bg-paper"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className={
              destructive
                ? "rounded bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:bg-danger/90 disabled:opacity-50"
                : "rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
            }
            disabled={isSubmitting || (!destructive && !value.trim())}
            type="submit"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
