import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Modal dialog on the native <dialog> element: focus trapping, Escape to close and the inert
 * background come from the browser.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="dialog-body">
          <div className="dialog-header">
            <h2>{title}</h2>
            <button type="button" className="btn btn-ghost dialog-close" onClick={onClose}>
              <span aria-hidden="true">✕</span>
              <span className="visually-hidden">Close</span>
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
