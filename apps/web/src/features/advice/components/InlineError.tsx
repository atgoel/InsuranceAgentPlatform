export function InlineError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="advice-error" role="alert">
      {message}
    </p>
  );
}
