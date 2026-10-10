'use client';

import type { ComponentProps, ReactNode } from 'react';
import { StackView } from '../ui';

/**
 * A phone screen built on StackView: the stack runs edge to edge (its header hairline spans the phone),
 * takes the full height, scrolls its own content, and the purpose-primary in `actions` stays docked at the
 * bottom (DESIGN.md v2 §4). Screens inside get a flex column, so a child can push its own actions down with
 * `mt-auto`.
 */
export function StackPage({
  actions,
  children,
  testId,
  ...stack
}: Omit<ComponentProps<typeof StackView>, 'children' | 'className'> & {
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="-mx-4 -mt-6 -mb-8 flex min-h-0 flex-1 flex-col [&_.kl2-stack__viewport]:flex [&_.kl2-stack__viewport]:flex-col [&_.kl2-stack__screen]:flex [&_.kl2-stack__screen]:flex-[1_0_auto] [&_.kl2-stack__screen]:flex-col"
      data-testid={testId}
    >
      <StackView {...stack} className="min-h-0 flex-1">
        <div className="flex flex-1 flex-col gap-4 px-4 pt-4 pb-6">{children}</div>
      </StackView>
      {actions ? <div className="kl-actions m-0 border-line border-t px-4 pt-4 pb-6">{actions}</div> : null}
    </div>
  );
}
