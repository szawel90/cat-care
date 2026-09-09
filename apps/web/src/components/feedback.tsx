import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';

export function Feedback({
  tone = 'success',
  children,
}: {
  tone?: 'success' | 'error';
  children: ReactNode;
}) {
  const isError = tone === 'error';
  const Icon = isError ? CircleAlert : CircleCheck;
  return (
    <div className={isError ? 'feedback error' : 'feedback'} role={isError ? 'alert' : 'status'}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
