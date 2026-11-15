"use client";

export function ConfirmForm({
  action,
  message,
  children,
}: {
  action: (fd: FormData) => Promise<void>;
  message: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
