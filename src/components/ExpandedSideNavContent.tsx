import type { ReactNode } from 'react';
import { useSideNavCollapse } from '@astryxdesign/core/SideNav';

export function ExpandedSideNavContent({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSideNavCollapse();
  return <div hidden={isCollapsed}>{children}</div>;
}
