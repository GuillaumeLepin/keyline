import { EmptyState } from '@keyline/ui';
import { copy } from '@/src/copy';

/** Tier-2 co-approval queue (Wave 3). Until then the laptop shows the designed empty state. */
export default function ApprovePage() {
  return <EmptyState title={copy.approve.emptyTitle} body={copy.approve.emptyBody} />;
}
