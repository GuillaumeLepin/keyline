import { EmptyState } from '@keyline/ui';
import { ScreenHeader } from '@/src/components/ScreenHeader';
import { copy } from '@/src/copy';

export default function AlertsPage() {
  return (
    <>
      <ScreenHeader title={copy.alerts.emptyTitle} backHref="/" />
      <EmptyState title={copy.alerts.emptyTitle} body={copy.alerts.emptyBody} />
    </>
  );
}
