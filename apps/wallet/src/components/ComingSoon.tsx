import { Button, EmptyState } from '@keyline/ui';
import { copy } from '../copy';
import { ScreenHeader } from './ScreenHeader';

/** Stub for routes built in a later wave so links never 404. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <ScreenHeader title={title} backHref="/" />
      <EmptyState
        title={copy.common.comingSoonTitle}
        body={copy.common.comingSoonBody}
        action={
          <Button variant="secondary" href="/">
            {copy.common.back}
          </Button>
        }
      />
    </>
  );
}
